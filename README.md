# RunbookPilot

**Evidence-grounded incident response for cloud operations.**

RunbookPilot is a self-hosted incident-response copilot. It searches your local operational knowledge base first, checks whether the retrieved material supports its answer, and can use Tavily web search when internal runbooks are not enough. LangGraph and SQLite preserve incident context between follow-up questions.

The project includes a browser-based chat interface, document uploads, source attribution, workflow traces, an audit API, and a command-line ingestion script. It is built with FastAPI, LangGraph, Groq, local Hugging Face embeddings, and persistent local Qdrant storage.

> **Important:** This is a demonstration application, not a production-ready incident-management or security platform. It does not include user authentication, authorization, tenant isolation, or a UI audit-history screen. Do not expose it to an untrusted network without adding appropriate security controls.

## Contents

- [How it works](#how-it-works)
- [Features](#features)
- [Technology](#technology)
- [Project layout](#project-layout)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Add operational documents](#add-operational-documents)
- [Use the application](#use-the-application)
- [HTTP API](#http-api)
- [Run with Docker](#run-with-docker)
- [Data and persistence](#data-and-persistence)
- [Troubleshooting](#troubleshooting)
- [Limitations and production considerations](#limitations-and-production-considerations)

## How it works

For each chat request, RunbookPilot uses the following workflow:

```text
User question
    │
    ▼
Load conversation state from LangGraph / SQLite
    │
    ▼
Rewrite a follow-up question with incident context
    │
    ▼
Decide whether evidence retrieval is needed
    ├── No ──► Generate a general response
    │
    └── Yes
         │
         ▼
      Search the local Qdrant runbook collection
         │
         ▼
      Grade retrieved documents for relevance
         ├── Relevant ──► Generate answer from evidence
         └── Not relevant ──► Rewrite query and retry
                                │
                                ▼
                           Optional Tavily search
                                │
                                ▼
                           Grade web evidence
         │
         ▼
      Check answer support and usefulness
         ├── Revise or retry when allowed
         └── Return a safe no-evidence response if needed
    │
    ▼
Save conversation state and audit record
    │
    ▼
Return answer, route, sources, verification status, and trace
```

The workflow uses the configured Groq chat model for retrieval decisions, query rewriting, evidence grading, response generation, and answer checks. When a request can be answered without retrieval, it can use the general-response path instead.

## Features

- **Private knowledge first:** retrieve from a persistent, local Qdrant collection before using external search.
- **Self-RAG checks:** grade retrieved documents for relevance and check generated answers for evidence support and usefulness.
- **Bounded retry loops:** configurable limits control internal query rewrites, web-query rewrites, and support-driven answer revisions.
- **Optional web fallback:** search with Tavily when internal evidence is insufficient. Web-derived guidance is labeled separately from internal runbooks.
- **Persistent incident context:** LangGraph's SQLite checkpointer keeps context by `thread_id`, allowing follow-up questions to refer to earlier turns.
- **Document ingestion:** ingest PDF, TXT, Markdown, and DOCX files from the command line or browser.
- **Source attribution:** return internal document names/pages and web result titles/URLs where available.
- **Workflow transparency:** return a trace of retrieval, grading, rewriting, and answer checks.
- **Audit records:** store chat questions, answers, route, sources, and workflow details in a separate SQLite database, available through the audit API.
- **Local embeddings:** use a Hugging Face sentence-transformer model locally; no hosted embedding API is required.
- **FastAPI application:** serve the browser UI and JSON API from the same application.

## Technology

| Component | Role |
| --- | --- |
| FastAPI + Uvicorn | Web server, browser UI, and JSON API |
| LangGraph | Self-RAG workflow and conditional routing |
| Groq | Chat model for decisions, generation, and verification |
| Hugging Face Sentence Transformers | Local document and query embeddings |
| Qdrant local mode | Persistent vector search for internal documents |
| Tavily | Optional internet-search fallback |
| SQLite | LangGraph conversation checkpoints and chat audit records |
| Jinja2, HTML, CSS, JavaScript | Browser-based incident console |

## Project layout

```text
RunbookPilot/
├── app.py                   # FastAPI application and HTTP endpoints
├── data_ingestion.py        # Ingest documents/ into Qdrant
├── requirements.txt         # Python dependencies
├── Dockerfile               # Container image definition
├── .env.example             # Environment-variable template
├── documents/               # Initial internal runbooks and SOPs
├── src/
│   ├── config.py            # Environment settings and defaults
│   ├── db.py                # SQLite audit database
│   ├── ingestion.py         # File loading, splitting, and indexing
│   ├── models.py            # API request and response models
│   ├── self_rag.py          # LangGraph workflow and memory
│   └── vectorstore.py       # Embeddings and Qdrant configuration
├── templates/
│   └── index.html           # Browser application
├── static/
│   ├── app.js               # Browser/API interaction
│   └── styles.css           # UI styles
├── data/                    # Local Qdrant and SQLite files
├── uploads/                 # Files uploaded through the browser
└── docs/                    # Supporting project documentation/assets
```

## Requirements

- Python 3.10 or newer (the Docker image uses Python 3.11)
- A Groq API key for chat and Self-RAG operations
- Internet access on first run to download the embedding model
- Optional Tavily API key to enable web-search fallback
- Docker Engine/Desktop only if using the container instructions

The embedding model runs locally on CPU by default. Model download and inference speed depend on the host machine and network.

## Quick start

### 1. Get the project and enter its directory

Open a terminal in the project root—the directory containing `app.py` and `requirements.txt`.

### 2. Create and activate a virtual environment

**Windows PowerShell**

If you already have a `venv` folder in the project, activate that environment:

```powershell
.\venv\Scripts\Activate.ps1
```

To create a new environment instead, run both commands:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
```

If PowerShell blocks script activation, you can allow it for this terminal session:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\venv\Scripts\Activate.ps1
```

Use `.\.venv\Scripts\Activate.ps1` instead in the new-environment instructions above. Alternatively, in Command Prompt activate the existing `venv`:

```bat
venv\Scripts\activate.bat
```

For a new `.venv`, use `.venv\Scripts\activate.bat` instead.

**macOS / Linux**

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install dependencies

```bash
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

### 4. Configure environment variables

Copy `.env.example` to `.env` and add your Groq API key. The `.env` file is ignored by Git; keep it private.

**Windows PowerShell**

```powershell
Copy-Item .env.example .env
```

**macOS / Linux**

```bash
cp .env.example .env
```

At a minimum, set:

```env
GROQ_API_KEY=your_groq_api_key
```

Add a `TAVILY_API_KEY` if you want web search. See [Configuration](#configuration) for all supported settings.

### 5. Index the included runbooks

```bash
python data_ingestion.py
```

The first run downloads the embedding model if it is not already cached. The script creates or validates the configured Qdrant collection, reads supported files from `documents/`, splits them into chunks, embeds them locally, and stores them in Qdrant.

### 6. Start RunbookPilot

```bash
python app.py
```

Or run Uvicorn directly:

```bash
uvicorn app:app --host 127.0.0.1 --port 8080 --reload
```

Open [http://127.0.0.1:8080](http://127.0.0.1:8080) in a browser. The first chat request also needs a valid Groq API key.

## Configuration

Settings are read from environment variables (typically from `.env`). Defaults are defined in `src/config.py`.

| Variable | Default | Description |
| --- | --- | --- |
| `GROQ_API_KEY` | *(required for chat)* | Groq API key. |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Groq model used for chat, workflow decisions, and verification. |
| `GROQ_MAX_TOKENS` | `1024` | Maximum tokens for standard model calls. Structured Self-RAG checks use a separate 256-token limit. |
| `EMBEDDING_MODEL` | `sentence-transformers/all-MiniLM-L6-v2` | Local Hugging Face sentence-transformer model. |
| `EMBEDDING_DIMENSION` | `384` | Vector size for the configured embedding model. Must match the model and existing collection. |
| `QDRANT_PATH` | `data/qdrant` | Local persistent Qdrant directory. Relative paths are resolved from the project root. |
| `QDRANT_COLLECTION_NAME` | `cloudops_sentinel` | Qdrant collection used for both ingestion and retrieval. |
| `TAVILY_API_KEY` | *(optional)* | Enables internet-search fallback when configured. |
| `TOP_K` | `5` | Number of documents requested from Qdrant per retrieval. |
| `MAX_SUPPORT_RETRIES` | `2` | Maximum answer revisions after support checks. |
| `MAX_RETRIEVAL_REWRITES` | `2` | Maximum query rewrites for internal retrieval. |
| `MAX_WEB_REWRITES` | `2` | Maximum web-query rewrites. |
| `DATABASE_PATH` | `data/audit.db` | Path to the audit database. Relative paths are resolved from the project root. |

Example configuration:

```env
GROQ_API_KEY=your_groq_api_key
TAVILY_API_KEY=your_tavily_api_key

GROQ_MODEL=llama-3.3-70b-versatile
GROQ_MAX_TOKENS=1024

EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
EMBEDDING_DIMENSION=384

QDRANT_PATH=data/qdrant
QDRANT_COLLECTION_NAME=cloudops_sentinel
TOP_K=5

MAX_SUPPORT_RETRIES=2
MAX_RETRIEVAL_REWRITES=2
MAX_WEB_REWRITES=2

DATABASE_PATH=data/audit.db
```

The collection's default identifier retains the earlier `cloudops_sentinel` name to keep existing local Qdrant data connected after the RunbookPilot rebrand. You can select a different collection with `QDRANT_COLLECTION_NAME`; that collection will not contain the old collection's vectors unless you ingest the documents into it.

If a collection exists with a vector dimension different from `EMBEDDING_DIMENSION`, RunbookPilot stops with a configuration error. Use a compatible embedding model/dimension or choose a new collection after backing up any data you need.

## Add operational documents

### Supported file types

RunbookPilot accepts:

- PDF (`.pdf`)
- Plain text (`.txt`)
- Markdown (`.md`)
- Word documents (`.docx`)

### Initial or batch ingestion

1. Place supported files directly inside `documents/`.
2. Run:

   ```bash
   python data_ingestion.py
   ```

The ingestion script uses the same embedding model, vector dimension, Qdrant path, and collection as the application. Files are split into chunks of 800 characters with 160 characters of overlap. Stable chunk IDs make re-ingesting unchanged chunks update their existing points instead of blindly adding randomly identified duplicates.

### Upload through the browser

1. Open the RunbookPilot page.
2. Select a PDF, TXT, Markdown, or DOCX file in **Runbook Vault**.
3. Select **Add to knowledge base**.
4. Wait for the indexed chunk count and collection identifier.
5. Ask a question that needs the new runbook.

Uploads are stored under `uploads/` and indexed into the same collection used by the initial ingestion script.

## Use the application

- **Ask an incident question:** enter a production symptom or operational question and submit it.
- **Continue an incident:** ask a follow-up; the browser reuses its saved thread ID and LangGraph can use earlier conversation context.
- **Start a fresh incident:** select **New Session** to generate a new thread ID.
- **Inspect evidence:** review the displayed source list, route, support/usefulness statuses, and expandable Self-RAG trace.
- **Add a runbook:** use the Runbook Vault upload panel.
- **Use sample questions:** select one of the incident prompts to populate the composer.

Browser thread IDs are stored in `localStorage`. Existing sessions from the previous browser key are reused and migrated to the new key when possible. Clearing browser storage starts a new browser-side session; existing checkpoint records are not automatically deleted.

## HTTP API

The API is served by the same FastAPI application. Interactive API documentation is available at [http://127.0.0.1:8080/docs](http://127.0.0.1:8080/docs) while the server is running.

### `GET /api/health`

Returns a basic service status. This is a liveness check; it does not verify Groq, Tavily, Qdrant, or model availability.

```json
{
  "status": "ok",
  "service": "runbookpilot-self-rag"
}
```

### `POST /api/chat`

Request JSON:

```json
{
  "question": "Our checkout API is returning 502 errors after deployment. What should I check first?",
  "thread_id": "incident-unique-session-id"
}
```

`question` must contain 2–2000 characters and `thread_id` must contain 3–120 characters.

Example using `curl`:

```bash
curl -X POST http://127.0.0.1:8080/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"question\":\"What should I check next?\",\"thread_id\":\"incident-demo-001\"}"
```

The response includes:

| Field | Description |
| --- | --- |
| `answer` | Generated response. |
| `route` | `Private Runbooks`, `Internet Search`, `General Knowledge`, or `No Reliable Evidence`. |
| `used_web_search` | Whether the workflow entered the web-search path. Configure Tavily to perform an actual search. |
| `support_status` | Evidence support result when applicable. |
| `usefulness` | Usefulness-check result when applicable. |
| `sources` | Internal document or web sources used for the answer. |
| `trace` | Workflow steps recorded during this request. |
| `thread_id` | Conversation identifier supplied by the caller. |
| `memory_turns` | Number of conversation entries in the returned checkpoint state. |

### `POST /api/upload`

Multipart form upload with a field named `file`. Supported extensions are `.pdf`, `.txt`, `.md`, and `.docx`. The response contains the filename, number of indexed chunks, and collection identifier.

### `GET /api/audits?limit=20`

Returns recent chat audit records. `limit` is bounded to 1–100. This endpoint is not currently connected to the **Audit Trail** navigation item in the browser UI.

## Run with Docker

The repository includes a `Dockerfile`. From the project root, build the image:

```bash
docker build -t runbookpilot:latest .
```

Run the service with persistent Docker volumes for the local databases and uploads:

```bash
docker run -d \
  --name runbookpilot \
  -p 8080:8080 \
  --env-file .env \
  -v runbookpilot-data:/app/data \
  -v runbookpilot-uploads:/app/uploads \
  runbookpilot:latest
```

On Windows PowerShell, run the same Docker command on one line:

```powershell
docker run -d --name runbookpilot -p 8080:8080 --env-file .env -v runbookpilot-data:/app/data -v runbookpilot-uploads:/app/uploads runbookpilot:latest
```

Index the example documents in the running container:

```bash
docker exec runbookpilot python data_ingestion.py
```

Then open [http://127.0.0.1:8080](http://127.0.0.1:8080). The container uses port `8080` by default; the application port can be changed by setting `PORT`.

The named volumes preserve `/app/data` and `/app/uploads` when the container is replaced. The first container run may need network access to download the embedding model. To stop and remove the container while preserving its data volumes:

```bash
docker stop runbookpilot
docker rm runbookpilot
```

## Data and persistence

| Path | Purpose |
| --- | --- |
| `data/qdrant/` | Persistent local Qdrant vector database. |
| `data/langgraph_memory.sqlite` | LangGraph conversation checkpoints, keyed by thread ID. This path is currently fixed in `src/self_rag.py`. |
| `data/audit.db` | Chat audit records; path is configurable with `DATABASE_PATH`. |
| `uploads/` | Files submitted using the browser upload feature. |

The browser stores its active thread ID in `localStorage`; LangGraph stores the associated conversation checkpoint on the server. The audit database is separate from conversation memory.

## Troubleshooting

### `GROQ_API_KEY is not configured`

Add a valid `GROQ_API_KEY` to `.env` in the project root, then restart the application. Chat and Self-RAG model calls require Groq credentials.

### Qdrant vector-size mismatch

The embedding model's output dimension must match `EMBEDDING_DIMENSION` and the selected collection. Use a compatible model/dimension or select a new collection with `QDRANT_COLLECTION_NAME`. Back up data before removing or replacing a collection.

### No internal documents are found

Confirm that supported files are directly inside `documents/`, then rerun `python data_ingestion.py`. Check that the ingestion and application processes use the same `.env`, `QDRANT_PATH`, and `QDRANT_COLLECTION_NAME`.

### Web fallback does not return results

Set `TAVILY_API_KEY` and restart the application. Without the key, the workflow records that internet search is unavailable and can return a no-reliable-evidence result instead.

### Port 8080 is already in use

Run Uvicorn on another port, for example:

```bash
uvicorn app:app --host 127.0.0.1 --port 8081 --reload
```

Then open `http://127.0.0.1:8081`.

### Slow first run

The embedding model is downloaded and loaded locally on first use. Subsequent runs can reuse the local model cache.

## Limitations and production considerations

- **No authentication or authorization:** the UI and API are not protected by user accounts or access controls.
- **Local vector database:** Qdrant runs in local persistent mode; this is not a distributed or managed Qdrant deployment.
- **Local model inference:** embeddings run on CPU by default and can be slow on resource-constrained hosts.
- **External services:** chat/model operations send prompts and relevant context to Groq. When enabled, search queries are sent to Tavily. Review your organization's data-handling requirements before using sensitive operational material.
- **Audit screen:** audit records are available through `GET /api/audits`, but the UI navigation item is not implemented as a history view.
- **Database lifecycle:** conversation checkpoints and audit records are not automatically expired or pruned.
- **Operational hardening:** before production use, add authentication, authorization, TLS, request/upload size limits, rate limiting, access logging, database backup/retention, and deployment-specific health monitoring.
