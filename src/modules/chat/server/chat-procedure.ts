import { z } from "zod";
import { chatRooms, chatMessages, users } from "@/db/schema";
import { and, eq, desc, or } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "@/app/trpc/init";
import { db } from "@/db";
import { pusher } from "@/lib/pusher";
import { alias } from "drizzle-orm/pg-core";

export const chatRouter = createTRPCRouter({
  // Get chat rooms for the doctor
  getChatRooms: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      try {
        // Create aliases for the users table
        const doctor = alias(users, "doctor");
        const patient = alias(users, "patient");

        // Fetch the current doctor's details
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.clerkId, input.userId))
          .limit(1);

        if (!user) {
          throw new Error("User not found or access denied: [Chat Rooms]" + input.userId);
        }

        const doctorId = user.id;

        // Fetch chat rooms with associated doctor and patient details
        const rooms = await db
          .select({
            room: chatRooms,
            doctor: {
              id: doctor.id,
              firstName: doctor.firstName,
              lastName: doctor.lastName,
              imageUrl: doctor.imageUrl,
            },
            patient: {
              id: patient.id,
              firstName: patient.firstName,
              lastName: patient.lastName,
              imageUrl: patient.imageUrl,
            },
          })
          .from(chatRooms)
          .leftJoin(doctor, eq(chatRooms.doctorId, doctor.id)) // Join with doctor alias
          .leftJoin(patient, eq(chatRooms.patientId, patient.id)) // Join with patient alias
          .where(eq(chatRooms.doctorId, doctorId)) // Filter by doctor ID
          .orderBy(desc(chatRooms.createdAt)); // Order by creation date

        // Transform the result to match the expected format
        return rooms.map(({ room, doctor, patient }) => ({
          ...room,
          doctor,
          patient,
        }));
      } catch (error: any) {
        console.error(error);
        console.log(error.stack);
        throw new Error("Failed to get chat rooms");
      }
    }),

  // Get messages for a specific chat room
  getMessages: protectedProcedure
    .input(z.object({ chatRoomId: z.string() }))
    .query(async ({ input }) => {
      const messages = await db
        .select({
          message: chatMessages,
          sender: {
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            imageUrl: users.imageUrl,
          },
        })
        .from(chatMessages)
        .leftJoin(users, eq(chatMessages.senderId, users.id))
        .where(eq(chatMessages.chatRoomId, input.chatRoomId))
        .orderBy(chatMessages.createdAt);

      // Transform the result to match the expected format
      return messages.map(({ message, sender }) => ({
        ...message,
        sender,
      }));
    }),

  // Update user presence status
  updateUserPresence: protectedProcedure
    .input(z.object({ userId: z.string(), status: z.enum(["online", "offline"]) }))
    .mutation(async ({ input }) => {
      await pusher.trigger(`presence-${input.userId}`, "user-status", {
        userId: input.userId,
        status: input.status,
      });
    }),

  // Send a message
  sendMessage: protectedProcedure
    .input(
      z.object({
        chatRoomId: z.string(),
        senderId: z.string(),
        content: z.string(),
        type: z.enum(["text", "image", "document", "emoji"]),
        fileUrl: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      // First, verify the chat room exists and the user has access
      const user = await db
        .select()
        .from(users)
        .where(eq(users.clerkId, input.senderId))
        .limit(1);

      if (!user.length) {
        throw new Error("User not found or access denied: [Send Message]" + input.senderId);
      }

      const userId = user[0].id;

      try {
        const chatRoom = await db
          .select()
          .from(chatRooms)
          .where(
            and(
              eq(chatRooms.id, input.chatRoomId),
              // Ensure the user is either the patient or doctor
              or(eq(chatRooms.patientId, userId), eq(chatRooms.doctorId, userId))
          ))
          .limit(1)

        if (!chatRoom.length) {
          throw new Error("Chat room not found or access denied");
        }

        // Insert the new message
        const [newMessage] = await db
          .insert(chatMessages)
          .values({
            chatRoomId: input.chatRoomId,
            senderId: userId,
            content: input.content,
            type: input.type,
            fileUrl: input.fileUrl,
          })
          .returning();

        // Get the sender information for the response
        const [sender] = await db
          .select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            imageUrl: users.imageUrl,
          })
          .from(users)
          .where(eq(users.id, userId));

        // Combine message with sender info
        const messageWithSender = {
          ...newMessage,
          sender,
        };

        // Trigger Pusher event with the complete message data
        await pusher.trigger(
          `chat-room-${input.chatRoomId}`,
          "new-message",
          messageWithSender
        );

        return messageWithSender;
      } catch (error: any) {
        console.log(error.stack);
        console.log(error);
      }
    }),
});