import os
from functools import lru_cache
from langchain_huggingface import HuggingFaceEmbeddings, HuggingFaceEndpointEmbeddings
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient
from qdrant_client.http.models import Distance, VectorParams
from src.config import get_settings


@lru_cache
def get_embeddings():
    s = get_settings()

    if s.embedding_provider == "google":
        if not s.google_api_key:
            raise RuntimeError("GOOGLE_API_KEY is not configured")
        return GoogleGenerativeAIEmbeddings(
            model=s.gemini_embedding_model,
            google_api_key=s.google_api_key,
        )

    endpoint = os.getenv("HF_EMBEDDING_ENDPOINT") or os.getenv("HF_INFERENCE_ENDPOINT")
    if endpoint:
        return HuggingFaceEndpointEmbeddings(
            model=endpoint,
            task="feature-extraction",
            huggingfacehub_api_token=os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACEHUB_API_TOKEN"),
        )

    return HuggingFaceEmbeddings(
        model_name=s.embedding_model,
        model_kwargs={"device": "cpu"},
        encode_kwargs={"normalize_embeddings": True},
    )


@lru_cache
def get_qdrant_client():
    s = get_settings()
    if s.qdrant_url and s.qdrant_api_key:
        return QdrantClient(
            url=s.qdrant_url,
            api_key=s.qdrant_api_key,
        )
    return QdrantClient(location=":memory:")


def ensure_collection():
    s = get_settings()
    client = get_qdrant_client()
    
    collections = client.get_collections().collections
    exists = any(c.name == s.qdrant_collection_name for c in collections)

    if not exists:
        client.create_collection(
            collection_name=s.qdrant_collection_name,
            vectors_config=VectorParams(
                size=s.embedding_dimension,
                distance=Distance.COSINE
            ),
        )


def get_vector_store():
    s = get_settings()
    ensure_collection()
    client = get_qdrant_client()
    
    return QdrantVectorStore(
        client=client,
        collection_name=s.qdrant_collection_name,
        embedding=get_embeddings(),
    )


def get_retriever():
    s = get_settings()
    return get_vector_store().as_retriever(search_kwargs={"k": s.top_k})