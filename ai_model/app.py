import os
import uuid
from typing import List, Dict
from dotenv import load_dotenv

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# -----------------------------
# LangChain / Upstage / Chroma
# -----------------------------
from langchain_upstage import UpstageEmbeddings, ChatUpstage
from langchain_chroma import Chroma
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain.retrievers import ParentDocumentRetriever
from langchain.storage.file_system import LocalFileStore
from langchain.storage._lc_store import create_kv_docstore
from langchain.retrievers.multi_query import MultiQueryRetriever

from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.chains.history_aware_retriever import create_history_aware_retriever
from langchain.chains.retrieval import create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain

# -----------------------------
# 환경 변수 로드
# -----------------------------
load_dotenv()

# -----------------------------
# FastAPI 초기화 + CORS 설정
# -----------------------------
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 필요에 따라 특정 도메인만 허용
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -----------------------------
# 데이터 모델 정의
# -----------------------------
class ChatRequest(BaseModel):
    input: str
    chat_history: List[Dict[str, str]]  # {"role": "user"|"assistant", "content": str}


class ChatResponse(BaseModel):
    answer: str
    context: str


# -----------------------------
# RAG 구성 (Streamlit 코드에서 옮겨옴)
# -----------------------------
# 1) ChromaDB 로드
vectorstore = Chroma(
    collection_name="split_parents",
    embedding_function=UpstageEmbeddings(model="embedding-passage"),
    persist_directory="child_DB(Chroma)",
)

# 2) LocalFileStore 로드 -> parent fs
fs = LocalFileStore("./parent_fs_chroma")
store = create_kv_docstore(fs)

# 3) child_splitter
child_splitter = RecursiveCharacterTextSplitter(chunk_size=400)

# 4) Chat Model
chat = ChatUpstage()

# 5) ParentDocumentRetriever
retriever_parent = ParentDocumentRetriever(
    vectorstore=vectorstore,
    docstore=store,
    child_splitter=child_splitter,
    search_kwargs={"k": 5},
)

# 6) MultiQueryRetriever
retriever_multi = MultiQueryRetriever.from_llm(retriever=retriever_parent, llm=chat)

# 7) "기억(질문 재구성)"을 입히는 retriever
contextualize_q_system_prompt = """When there are older conversations and more recent user questions, these questions may be related to previous conversations. In this case, change the question to a question that can be understood independently without needing to know the content of the conversation. You don't have to answer the question, just reformulate it if necessary or leave it as is."""

contextualize_q_prompt = ChatPromptTemplate.from_messages(
    [
        ("system", contextualize_q_system_prompt),
        MessagesPlaceholder("chat_history"),
        ("human", "{input}"),
    ]
)

history_aware_retriever = create_history_aware_retriever(
    llm=chat, retriever=retriever_multi, prompt=contextualize_q_prompt
)

# 8) QA System Prompt
qa_system_prompt = """
You are an intelligent assistant helping the members of the Korean National Assembly with questions related to law and policy. Read the given questions carefully and WRITE YOUR ANSWER ONLY BASED ON THE CONTEXT AND DON'T SEARCH ON THE INTERNET. Give the answer in Korean ONLY using the following pieces of the context. You must answer politely.

DO NOT TRY TO MAKE UP AN ANSWER:
 - If the answer to the question cannot be determined from the context alone, say "I cannot determine the answer to that.".
 - If the context is empty, just say "I do not know the answer to that.".

Context: {context}
"""

qa_prompt = ChatPromptTemplate.from_messages(
    [
        ("system", qa_system_prompt),
        MessagesPlaceholder("chat_history"),
        (
            "human",
            "{input}" + " 최신 정보부터 시간의 흐름에 따라 작성해줘.",
        ),
    ]
)

# 9) QA Chain (stuff_documents_chain)
question_answer_chain = create_stuff_documents_chain(chat, qa_prompt)

# 10) Retrieval Chain
rag_chain = create_retrieval_chain(history_aware_retriever, question_answer_chain)


# -----------------------------
# API 엔드포인트
# -----------------------------
@app.post("/api/chat/{chatroom_id}/messages", response_model=ChatResponse)
async def chat_endpoint(chatroom_id: str, request: ChatRequest):
    try:
        print(f"Received message for chatroom {chatroom_id}: {request.dict()}")

        # chat_history가 올바른 형태인지 확인
        if not isinstance(request.chat_history, list):
            raise HTTPException(status_code=400, detail="chat_history must be a list")

        # RAG 체인 실행
        result = rag_chain.invoke(
            {
                "input": request.input,
                "chat_history": request.chat_history,
            }
        )

        # context 파싱
        context = result.get("context", "")
        if isinstance(context, list):
            # 만약 list of Document처럼 들어온다면, 문자열로 합침
            context = "\n".join(
                [str(doc) if not isinstance(doc, str) else doc for doc in context]
            )
        elif not isinstance(context, str):
            context = str(context)

        print("RAG result:", result)  # 디버그용

        # 결과 반환
        return ChatResponse(
            answer=result["answer"],
            context=context,
        )

    except Exception as e:
        print(f"Error in /api/chat/{chatroom_id}/messages:", e)
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")
