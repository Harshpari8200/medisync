"use client"

import { useEffect, useRef, useState } from "react"
import { format } from "date-fns"
import { motion, AnimatePresence } from "framer-motion"
import { useUser } from "@clerk/nextjs"
import { trpc } from "@/app/trpc/client"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import { ImageIcon, PaperclipIcon, SendIcon, SmileIcon, Loader2 } from 'lucide-react'
import { pusherClient } from "@/lib/pusher-client"
import { EmojiPicker } from "../components/ui/emoji-picker";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link"
import { toast } from "sonner"
import { CldUploadButton, CldUploadWidget } from "next-cloudinary";
// Update the Message interface
interface Message {
    id: string
    senderId: string
    content: string
    type: "text" | "image" | "document" | "emoji"
    fileUrl?: string
    createdAt: Date
    sender: {
        id: string
        firstName: string
        lastName: string
        imageUrl: string
    }
}

// Update the ChatRoom interface
interface ChatRoom {
    id: string
    appointmentId: string
    patientId: string
    doctorId: string
    createdAt: Date
    updatedAt: Date
    doctor: {
        id: string
        firstName: string
        lastName: string
        imageUrl: string
    } | null
    patient: {
        id: string
        firstName: string
        lastName: string
        imageUrl: string
    } | null
}

export function ChatInterface() {
    const { user } = useUser()
    const [message, setMessage] = useState("")
    const [selectedRoom, setSelectedRoom] = useState<string | null>(null)
    const [showEmojiPicker, setShowEmojiPicker] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)
    const [isDoctorOnline, setIsDoctorOnline] = useState(false);
    const [resource, setResource] = useState<any>();
    const { data: chatRooms, isLoading: loadingRooms } = trpc.chat.getChatRooms.useQuery(
        { userId: user?.id ?? "" },
        { enabled: !!user }
    )
    const { data: DbUser, isLoading } = trpc.users.getUser.useQuery();

    const { data: messages = [], refetch: refetchMessages } = trpc.chat.getMessages.useQuery(
        { chatRoomId: selectedRoom ?? "" },
        { enabled: Boolean(selectedRoom) }
    )

    const sendMessage = trpc.chat.sendMessage.useMutation({
        onSuccess: () => {
            setMessage("")
            refetchMessages()
        },
    })

    useEffect(() => {
        if (!selectedRoom) return

        const channel = pusherClient.subscribe(`chat-room-${selectedRoom}`)
        channel.bind("new-message", () => {
            refetchMessages()
        })

        return () => {
            pusherClient.unsubscribe(`chat-room-${selectedRoom}`)
        }
    }, [selectedRoom, refetchMessages])

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [messages])




    const handleSendMessage = () => {
        if (!message.trim() || !selectedRoom || !user) return

        sendMessage.mutate({
            chatRoomId: selectedRoom,
            senderId: user.id,
            content: message,
            type: "text",
        })
    }
    const handleUpload = (result: any) => {
        console.log("Success", result);
        const fileUrl = result.info.secure_url; // Get the file URL from Cloudinary

        // Send the file URL as a message
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
    // Get the selected room details
    const selectedRoomData = selectedRoom ? chatRooms?.find(room => room.id === selectedRoom) : null;
    const doctorName = selectedRoomData?.doctor ?
        `Dr. ${selectedRoomData.doctor.firstName} ${selectedRoomData.doctor.lastName}` :
        "Doctor";
    const doctorImage = selectedRoomData?.doctor?.imageUrl || "";
    const doctorInitials = selectedRoomData?.doctor ?
        `${selectedRoomData.doctor.firstName[0]}${selectedRoomData.doctor.lastName[0]}` :
        "DR";

    useEffect(() => {
        if (!selectedRoom) return;

        const doctorId = selectedRoomData?.doctor?.id;
        if (!doctorId) return;

        const presenceChannel = pusherClient.subscribe(`presence-${doctorId}`);
        presenceChannel.bind("user-status", (data: { userId: string; status: string }) => {
            if (data.userId === doctorId) {
                setIsDoctorOnline(data.status === "online");
            }
        });

        return () => {
            pusherClient.unsubscribe(`presence-${doctorId}`);
        };
    }, [selectedRoom, selectedRoomData?.doctor?.id]);
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
                                    className={`w-full p-3 rounded-lg transition-colors ${selectedRoom === room.id
                                        ? "bg-primary/10"
                                        : "hover:bg-muted"
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <Avatar>
                                            <AvatarImage src={room.doctor?.imageUrl || ""} />
                                            <AvatarFallback>
                                                {room.doctor?.firstName?.[0] || ""}
                                                {room.doctor?.lastName?.[0] || ""}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="text-left">
                                            <div className="font-medium">
                                                {room.doctor ? `Dr. ${room.doctor.firstName} ${room.doctor.lastName}` : "Doctor"}
                                            </div>
                                            <div className="text-sm text-muted-foreground">
                                                Click to view chat
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </Card>

            {/* Chat Area */}
            <Card className="flex-1 flex flex-col">
                {selectedRoom ? (
                    <>
                        {/* Chat Header */}
                        <div className="p-4 border-b">
                            <div className="flex items-center gap-3">
                                <Avatar>
                                    <AvatarImage src={doctorImage} />
                                    <AvatarFallback>{doctorInitials}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <div className="font-medium">{doctorName}</div>
                                    <div className="text-sm text-muted-foreground">
                                        {isDoctorOnline ? "Online" : "Offline"}
                                    </div>
                                </div>
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
                                            className={`flex ${msg.senderId === DbUser?.id ? "justify-end" : "justify-start"}`}
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
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                // onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                                >
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
                                                uploadPreset="med-tech-preset" // Replace with your Cloudinary upload preset
                                                onSuccess={(result, { widget }) => {
                                                    //    console.log("Success", result);
                                                    handleUpload(result);
                                                    widget.close();
                                                }}
                                                options={{
                                                    sources: ['local']
                                                }}
                                            >
                                                {({ open }) => {
                                                    function handleOnClick() {
                                                        setResource(undefined);
                                                        open();
                                                    }
                                                    return (
                                                        <button onClick={handleOnClick} className="p-2 rounded-lg  hover:bg-primary/10">
                                                            <ImageIcon className="h-5 w-5" />
                                                        </button>
                                                    );
                                                }}
                                            </CldUploadWidget>

                                        </TooltipTrigger>
                                        <TooltipContent>Send image</TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>

                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <CldUploadWidget
                                                uploadPreset="med-tech-preset" // Replace with your Cloudinary upload preset
                                                onSuccess={(result, { widget }) => {
                                                    //    console.log("Success", result);
                                                    handleUpload(result);
                                                    widget.close();
                                                }}
                                                options={{
                                                    sources: ['local']
                                                }}
                                            >
                                                {({ open }) => {
                                                    function handleOnClick() {
                                                        setResource(undefined);
                                                        open();
                                                    }
                                                    return (
                                                        <button onClick={handleOnClick} className="p-2 rounded-lg  hover:bg-primary/10">
                                                            <PaperclipIcon className="h-5 w-5" />
                                                        </button>
                                                    );
                                                }}
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
                                            e.preventDefault()
                                            handleSendMessage()
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
    )
}