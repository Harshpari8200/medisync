"use client";

import { useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { useUser } from "@clerk/nextjs";
import { trpc } from "@/app/trpc/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ImageIcon, PaperclipIcon, SendIcon, SmileIcon, Loader2, VideoIcon, X } from 'lucide-react';
import { pusherClient } from "@/lib/pusher-client";
import { EmojiPicker } from "../components/ui/emoji-picker";
import Link from "next/link";
import { toast } from "sonner";
import { CldUploadButton, CldUploadWidget } from "next-cloudinary";
import { useVideoCallStore } from "@/lib/video-call-provider";

export function ChatInterface() {
    const { user } = useUser();
    const [message, setMessage] = useState("");
    const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [isPatientOnline, setIsPatientOnline] = useState(false);
    const { isOpen, open, meetingId, setMeetingId } = useVideoCallStore();
    const [loading, setLoading] = useState(false);

    const { data: chatRooms, isLoading: loadingRooms } = trpc.chat.getChatRooms.useQuery(
        { userId: user?.id ?? "" },
        { enabled: !!user }
    );

    const { data: DbUser, isLoading } = trpc.users.getUser.useQuery();

    const { data: messages = [], refetch: refetchMessages } = trpc.chat.getMessages.useQuery(
        { chatRoomId: selectedRoom ?? "" },
        { enabled: Boolean(selectedRoom) }
    );

    const sendMessage = trpc.chat.sendMessage.useMutation({
        onSuccess: () => {
            setMessage("");
            refetchMessages();
        },
    });

    useEffect(() => {
        if (!selectedRoom) return;

        const channel = pusherClient.subscribe(`chat-room-${selectedRoom}`);
        channel.bind("new-message", () => {
            refetchMessages();
        });

        return () => {
            pusherClient.unsubscribe(`chat-room-${selectedRoom}`);
        };
    }, [selectedRoom, refetchMessages]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSendMessage = () => {
        if (!message.trim() || !selectedRoom || !user) return;

        sendMessage.mutate({
            chatRoomId: selectedRoom,
            senderId: user.id,
            content: message,
            type: "text",
        });
    };

    const handleUpload = (result: any) => {
        const fileUrl = result.info.secure_url;
        sendMessage.mutate({
            chatRoomId: selectedRoom ?? "",
            senderId: user?.id ?? "",
            content: fileUrl,
            type: result.info.resource_type === "image" ? "image" : "document",
            fileUrl: fileUrl,
        });
    };

    const formatTimestamp = (date: Date) => {
        return formatDistanceToNow(new Date(date), { addSuffix: true });
    };

    const selectedRoomData = selectedRoom ? chatRooms?.find((room) => room.id === selectedRoom) : null;
    const patientName = selectedRoomData?.patient
        ? `${selectedRoomData.patient.firstName} ${selectedRoomData.patient.lastName}`
        : "Patient";
    const patientImage = selectedRoomData?.patient?.imageUrl || "";
    const patientInitials = selectedRoomData?.patient
        ? `${selectedRoomData.patient.firstName[0]}${selectedRoomData.patient.lastName[0]}`
        : "PT";

    useEffect(() => {
        if (!selectedRoom) return;

        const patientId = selectedRoomData?.patient?.id;
        if (!patientId) return;

        const presenceChannel = pusherClient.subscribe(`presence-${patientId}`);
        presenceChannel.bind("user-status", (data: { userId: string; status: string }) => {
            if (data.userId === patientId) {
                setIsPatientOnline(data.status === "online");
            }
        });

        return () => {
            pusherClient.unsubscribe(`presence-${patientId}`);
        };
    }, [selectedRoom, selectedRoomData?.patient?.id]);

    return (
        <div className="flex h-[100dvh] gap-4 p-4">
            {/* Chat Rooms List */}
            <Card className="w-80 flex flex-col">
                <div className="p-4 font-semibold">Chat Rooms</div>
                <Separator />
                <ScrollArea className="flex-1">
                    {loadingRooms ? (
                        <div className="flex items-center justify-center h-full">
                            <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                    ) : (
                        <div className="space-y-2 p-4">
                            {chatRooms?.map((room) => (
                                <button
                                    key={room.id}
                                    onClick={() => setSelectedRoom(room.id)}
                                    className={`w-full p-3 rounded-lg transition-colors ${selectedRoom === room.id ? "bg-primary/10" : "hover:bg-muted"
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <Avatar>
                                            <AvatarImage src={room.patient?.imageUrl || ""} />
                                            <AvatarFallback>
                                                {room.patient?.firstName?.[0] || ""}
                                                {room.patient?.lastName?.[0] || ""}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="text-left">
                                            <div className="font-medium">
                                                {room.patient
                                                    ? `${room.patient.firstName} ${room.patient.lastName}`
                                                    : "Patient"}
                                            </div>
                                            <div className="text-sm text-muted-foreground">Click to view chat</div>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </Card>

            {/* Chat Area */}
            <Card className="flex-1 flex flex-col w-full justify-between">
                {selectedRoom ? (
                    <>
                        {/* Chat Header */}
                        <div className="p-4 border-b flex items-center w-full justify-between">
                            <div className="flex items-center gap-3">
                                <Avatar>
                                    <AvatarImage src={patientImage} />
                                    <AvatarFallback>{patientInitials}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <div className="font-medium">{patientName}</div>
                                    <div className="text-sm text-muted-foreground">
                                        {isPatientOnline ? "Online" : "Offline"}
                                    </div>
                                </div>
                            </div>
                            <div className="videocallBtn">
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            {/* <Button
                                                variant="ghost"
                                                size="icon"
                                                disabled={loading}
                                                onClick={() => {
                                                    setLoading(true);
                                                    setMeetingId(selectedRoom);
                                                    open();
                                                    setLoading(false);
                                                }}
                                            >
                                                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                                                <VideoIcon className="h-5 w-5" />
                                            </Button> */}
                                            {/* // redirect to /meeting/appointmentId */}
                                            <Link href={`/meeting/${selectedRoom}`}>
                                                <Button variant="ghost" size="icon">
                                                    <VideoIcon className="h-5 w-5" />
                                                </Button>
                                            </Link>
                                        </TooltipTrigger>
                                        <TooltipContent>Start Video Call</TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                        </div>

                        {/* Messages Area */}
                        <ScrollArea ref={scrollRef} className="flex-1 p-4">
                            <AnimatePresence initial={false}>
                                <div className="space-y-4">
                                    {messages.map((msg) => (
                                        <motion.div
                                            key={msg.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0 }}
                                            className={`flex ${msg.senderId === DbUser?.id ? "justify-end" : "justify-start"
                                                }`}
                                        >
                                            <div
                                                className={`max-w-[70%] rounded-lg p-3 ${msg.senderId === user?.id
                                                    ? "bg-primary text-primary-foreground"
                                                    : "bg-muted"
                                                    }`}
                                            >
                                                {msg.type === "text" && <p>{msg.content}</p>}
                                                {msg.type === "image" && (
                                                    <img
                                                        src={msg.fileUrl || "/placeholder.svg"}
                                                        alt="Shared image"
                                                        className="rounded-lg max-w-full"
                                                    />
                                                )}
                                                {msg.type === "document" && (
                                                    <Link
                                                        href={msg.fileUrl ?? ""}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-blue-500 underline"
                                                    >
                                                        Download Document
                                                    </Link>
                                                )}
                                                <div
                                                    className={`text-xs mt-1 text-right ${msg.senderId === user?.id
                                                        ? "text-primary-foreground/70"
                                                        : "text-muted-foreground"
                                                        }`}
                                                >
                                                    {formatTimestamp(new Date(msg.createdAt))}
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            </AnimatePresence>
                        </ScrollArea>

                        {/* Input Area */}
                        <div className="p-4 border-t">
                            <div className="flex items-center gap-2">
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <EmojiPicker onChange={(emoji) => setMessage((prev) => prev + emoji)}>
                                                <Button variant="ghost" size="icon">
                                                    <SmileIcon className="h-5 w-5" />
                                                </Button>
                                            </EmojiPicker>
                                        </TooltipTrigger>
                                        <TooltipContent>Add emoji</TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>

                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <CldUploadWidget
                                                uploadPreset="med-tech-preset"
                                                onSuccess={(result) => handleUpload(result)}
                                                options={{ sources: ["local"] }}
                                            >
                                                {({ open }) => (
                                                    <button onClick={() => open()} className="p-2 rounded-lg hover:bg-primary/10">
                                                        <ImageIcon className="h-5 w-5" />
                                                    </button>
                                                )}
                                            </CldUploadWidget>
                                        </TooltipTrigger>
                                        <TooltipContent>Send image</TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>

                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <CldUploadWidget
                                                uploadPreset="med-tech-preset"
                                                onSuccess={(result) => handleUpload(result)}
                                                options={{ sources: ["local"] }}
                                            >
                                                {({ open }) => (
                                                    <button onClick={() => open()} className="p-2 rounded-lg hover:bg-primary/10">
                                                        <PaperclipIcon className="h-5 w-5" />
                                                    </button>
                                                )}
                                            </CldUploadWidget>
                                        </TooltipTrigger>
                                        <TooltipContent>Send file</TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>

                                <Input
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    placeholder="Type a message..."
                                    className="flex-1"
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSendMessage();
                                        }
                                    }}
                                />

                                <Button
                                    onClick={handleSendMessage}
                                    disabled={!message.trim() || sendMessage.isPending}
                                >
                                    {sendMessage.isPending ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <SendIcon className="h-4 w-4" />
                                    )}
                                </Button>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground">
                        Select a chat room to start messaging
                    </div>
                )}
            </Card>


        </div>
    );
}
