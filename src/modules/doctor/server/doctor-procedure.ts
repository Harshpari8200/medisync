// src/server/api/routers/doctor.ts
import { z } from "zod";
import { db } from "@/db";
import { appointments, aiAnalysis, users } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "@/app/trpc/init";

export const doctorRouter = createTRPCRouter({
    // Fetch upcoming appointments for the doctor
    getUpcomingAppointments: protectedProcedure
        .input(z.object({ limit: z.number().optional() }))
        .query(async ({ ctx, input }) => {
            try {
                const { clerkId: userId } = ctx.user;

                const appointmentsData = await db
                    .select({
                        id: appointments.id,
                        patientName: users.firstName,
                        date: appointments.date,
                        status: appointments.status,
                        severity: appointments.severity,
                        aiSummary: appointments.aiSummary,
                    })
                    .from(appointments)
                    .leftJoin(users, eq(appointments.patientId, users.clerkId))
                    .where(and(
                        eq(appointments.doctorId, userId), // Use doctorId from appointments
                        eq(appointments.status, "scheduled"),
                    ))
                    .orderBy(desc(appointments.date))
                    .limit(input.limit || 10);

                return appointmentsData;
            } catch (error: any) {
                console.error(`Error fetching upcoming appointments: ${error.message}`);
                return [];
            }
        }),

    // Fetch AI analysis summaries for the doctor's patients
    getPatientSummaries: protectedProcedure
        .input(z.object({ limit: z.number().optional() }))
        .query(async ({ ctx, input }) => {
            const { clerkId: userId } = ctx.user;

            const summaries = await db
                .select({
                    id: aiAnalysis.id,
                    patientName: users.firstName,
                    symptoms: aiAnalysis.symptoms,
                    severityScore: aiAnalysis.severityScore,
                    diseaseSummary: aiAnalysis.diseaseSummary,
                    suggestedMedications: aiAnalysis.suggestedMedications,
                    createdAt: aiAnalysis.createdAt,
                })
                .from(aiAnalysis)
                .leftJoin(users, eq(aiAnalysis.patientId, users.id))
                .leftJoin(appointments, eq(aiAnalysis.patientId, appointments.patientId))
                .where(and(
                    eq(appointments.doctorId, userId), // Use doctorId from appointments
                ))
                .orderBy(desc(aiAnalysis.createdAt))
                .limit(input.limit || 5);

            return summaries;
        }),
});