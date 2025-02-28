import { z } from "zod"
import { eq } from "drizzle-orm"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, protectedProcedure } from "../init";
import { specializations, users } from "@/db/schema";
import { db } from "@/db";

export const userRouter = createTRPCRouter({
    getUser: protectedProcedure.query(async ({ ctx }) => {
        const user = await db.select().from(users).where(eq(users.clerkId, ctx.clerkUserId as string));

        if (!user) {
            throw new TRPCError({
                code: "NOT_FOUND",
                message: "User not found",
            })
        }

        return user ? user[0] : null;
    }),

    updateProfile: protectedProcedure
        .input(
            z.object({
                role: z.enum(["admin", "patient", "doctor", "unlisted"]),
                dob: z.date(),
                gender: z.enum(["male", "female", "other"]),
                specialization: z.string().optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            await db
                .update(users)
                .set({
                    role: input.role,
                    dob: input.dob,
                    gender: input.gender,
                    specialization: input.specialization,
                })
                .where(eq(users.clerkId, ctx.clerkUserId as string))

            return { success: true }
        }),
})

