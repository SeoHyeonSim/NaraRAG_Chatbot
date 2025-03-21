import { getUserIdFromRequest } from "@/lib/auth";
import prismadb from "@/lib/prismadb";
import { NextRequest, NextResponse } from "next/server";
import fetch from "node-fetch";

// POST 핸들러
export async function POST(
    req: NextRequest,
    { params }: { params: { chatroomId: string } }
) {
    try {
        console.log("message post 호출됨");
        const { chatroomId } = await params;
        const { input, chat_history } = await req.json();

        console.log("Received data:", { input, chat_history });

        if (!chatroomId) {
            return NextResponse.json(
                { error: "Chatroom ID is required" },
                { status: 400 }
            );
        }

        // guest 채팅방은 인증 불필요
        let userId;
        if (chatroomId !== "guest") {
            userId = getUserIdFromRequest(req);

            if (!userId) {
                return NextResponse.json(
                    { error: "사용자 인증이 필요합니다." },
                    { status: 401 }
                );
            }

            // 채팅방 소유자 확인
            const chatroom = await prismadb.chatRoom.findUnique({
                where: { id: chatroomId },
            });

            if (!chatroom || chatroom.userId !== userId) {
                return NextResponse.json(
                    { error: "메시지를 생성할 권한이 없습니다." },
                    { status: 403 }
                );
            }
        }

        const messages = [
            ...(chat_history || []),
            { role: "user", content: input },
        ];

        const requestData = {
            input: input,
            chat_history: messages,
        };

        // AI 모델 API 호출
        const aiResponse = await fetch(
            `http://127.0.0.1:8000/api/chat/${chatroomId}/messages`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(requestData),
            }
        );

        const data = await aiResponse.json();

        if (!aiResponse.ok) {
            console.error("Server error:", await aiResponse.text());
            return NextResponse.json(
                { error: "Failed to get response from Server" },
                { status: 500 }
            );
        }

        if (!data || typeof data.answer !== "string") {
            return NextResponse.json(
                { error: "No answer from AI" },
                { status: 500 }
            );
        }

        console.log("AI Response:", data);

        // guest 채팅방은 데이터베이스에 저장하지 않음
        if (chatroomId !== "guest") {
            await prismadb.message.create({
                data: {
                    role: "user",
                    content: input,
                    chatroomId: chatroomId,
                    userId: userId,
                },
            });

            await prismadb.message.create({
                data: {
                    role: "system",
                    content: data.answer,
                    chatroomId: chatroomId,
                    userId: userId,
                },
            });
        }

        return NextResponse.json({
            answer: data.answer,
            context: data.context || "",
        });
    } catch (error) {
        console.error("Error sending message:", error);
        return NextResponse.json(
            { error: "Failed to send message" },
            { status: 500 }
        );
    }
}

// GET 핸들러
export async function GET(
    req: NextRequest,
    { params }: { params: { chatroomId: string } }
) {
    try {
        console.log("message get 호출됨");

        const { chatroomId } = await params;

        if (!chatroomId) {
            return NextResponse.json(
                { error: "Chatroom ID is required" },
                { status: 400 }
            );
        }

        // guest 채팅방은 인증 불필요
        if (chatroomId === "guest") {
            return NextResponse.json({ messages: [] });
        }

        const userId = getUserIdFromRequest(req);

        if (!userId) {
            return NextResponse.json(
                { error: "사용자 인증이 필요합니다." },
                { status: 401 }
            );
        }

        // 채팅방 소유자 확인
        const chatroom = await prismadb.chatRoom.findUnique({
            where: { id: chatroomId },
        });

        if (!chatroom || chatroom.userId !== userId) {
            return NextResponse.json(
                { error: "메시지를 조회할 권한이 없습니다." },
                { status: 403 }
            );
        }

        // 채팅방의 모든 메시지 불러오기
        const messages = await prismadb.message.findMany({
            where: { chatroomId: chatroomId },
            orderBy: { createdAt: "asc" },
        });

        return NextResponse.json({ messages });
    } catch (error) {
        console.error("Error fetching messages:", error);
        return NextResponse.json(
            { error: "Failed to fetch messages" },
            { status: 500 }
        );
    }
}
