import { z } from "zod";
import { db } from "@/db";
import {
  appointments,
  medicalRecords,
  prescriptions,
  users,
  specializations,
  payments,
  chatRooms,
} from "@/db/schema";
import { and, eq, desc, isNull, sql, gt, lt, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/app/trpc/init";
import { checkPaymentStatus } from "../services/payment";
import { predictDisease } from "@/lib/ai.service";

export const patientRouter = createTRPCRouter({
  getSpecializations: protectedProcedure.query(async () => {
    const specializationsData = await db.select().from(specializations);
    return specializationsData;
  }),

  getDoctorsBySpecialization: protectedProcedure
    .input(z.object({ specializationId: z.string() }))
    .query(async ({ input }) => {
      const doctors = await db
        .select()
        .from(users)
        .where(
          and(
            eq(users.role, "doctor"),
            eq(users.specialization, input.specializationId)
          )
        );
      return doctors;
    }),

  getAppointments: protectedProcedure
    .input(
      z.object({
        limit: z.number().optional(),
        upcoming: z.boolean().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { clerkId } = ctx.user;
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      if (input.upcoming) {
        const appointmentsData = await db
          .select({
            title: appointments.title,
            id: appointments.id,
            doctorName: users.firstName,
            date: appointments.date,
            status: appointments.status,
            severity: appointments.severity,
            notes: appointments.notes,
            doctorId: appointments.doctorId,
            specializationId: users.specialization, // Added specializationId
          })
          .from(appointments)
          .leftJoin(users, eq(appointments.doctorId, users.id))
          .where(
            and(
              eq(appointments.patientId, clerkId),
              gte(appointments.date, now)
            )
          )
          .orderBy(desc(appointments.date))
          .limit(input.limit || 10);

        return appointmentsData;
      }

      const appointmentsData = await db
        .select({
          title: appointments.title,
          id: appointments.id,
          doctorName: users.firstName,
          date: appointments.date,
          status: appointments.status,
          severity: appointments.severity,
          notes: appointments.notes,
          doctorId: appointments.doctorId,
          specializationId: users.specialization, // Added specializationId
        })
        .from(appointments)
        .leftJoin(users, eq(appointments.doctorId, users.id))
        .where(
          and(eq(appointments.patientId, clerkId), lt(appointments.date, now))
        )
        .orderBy(desc(appointments.date))
        .limit(input.limit || 10);

      return appointmentsData;
    }),

  createAppointment: protectedProcedure
    .input(
      z.object({
        title: z.string().optional(),
        doctorId: z.string(),
        date: z.date(),
        notes: z.string().optional(),
        severity: z.enum(["low", "medium", "high", "critical"]).optional(),
        paymentId: z.string().uuid().optional(), // Ensure paymentId is a valid UUID or null
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const clerkId = ctx.clerkUserId || "";
        const user = await db
          .select()
          .from(users)
          .where(eq(users.clerkId, clerkId))
          .limit(1);
        if (!user.length) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found",
          });
        }
        const userId = user[0].id; // Use the UUID `id` from the `users` table
        const [counts] = await db
          .select()
          .from(payments)
          .where(
            and(
              eq(payments.patientId, userId),
              eq(payments.status, "completed"),
              eq(payments.paymentType, "single")
            )
          )
          .orderBy(desc(payments.createdAt))
          .limit(1); // Get the most recent payment for the user

        if (counts) {
          if (counts.remainingAppointments <= 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "No remaining appointments",
            });
          }
        }
        // decrement remaining appointments
        await db
          .update(payments)
          .set({
            remainingAppointments: sql`${payments.remainingAppointments} - 1`, // Decrement by 1
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(payments.id, counts.id),
              gt(payments.remainingAppointments, 0) // Ensure it doesn't go negative
            )
          );
        const aiSummary = (await predictDisease(
          input.notes?.split(" ") || []
        )) ?? {
          name: "Unknown",
          probability: 0,
          description: "Unknown",
          suggestedAction: "Unknown",
        };
        // Create the appointment
        const newAppointment = await db
          .insert(appointments)
          .values({
            title: input.title || "Appointment", // Default to "Appointment"
            patientId: userId, // Use the UUID `userId`
            doctorId: input.doctorId,
            date: input.date,
            notes: input.notes,
            severity: input.severity || "low",
            paymentId: input.paymentId || null, // Ensure paymentId is a valid UUID or null
            aiSummary: `
            name: ;START; ${aiSummary[0]?.name || "Unknown"} ;ENDLINE;
            probability: ;START; ${aiSummary[0]?.probability || 0} ;ENDLINE;
            description: ;START; ${
              aiSummary[0]?.description || "Unknown"
            } ;ENDLINE;
            suggestedAction: ${
              aiSummary[0]?.suggestedAction || "Unknown"
            } ;ENDLINE;
            `,
          })
          .returning();

        // Decrease the remainingAppointments count for the payment
        if (input.paymentId) {
          await db
            .update(payments)
            .set({
              remainingAppointments: sql`${payments.remainingAppointments} - 1`, // Decrement by 1
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(payments.id, input.paymentId),
                gt(payments.remainingAppointments, 0) // Ensure it doesn't go negative
              )
            );
        }
        // create a chat room
        const [chatRoom] = await db
          .insert(chatRooms)
          .values({
            appointmentId: newAppointment[0].id,
            patientId: userId,
            doctorId: input.doctorId,
          })
          .returning();
        console.log(
          `[Chat Room]: created a chat room ${chatRoom.id} for appointment ${newAppointment[0].id}`
        );
        return {
          success: true,
          appointment: newAppointment[0],
        };
      } catch (error: any) {
        console.error(error);
        return {
          success: false,
          error: error.message,
        };
      }
    }),
  completeAppointmentAfterPayment: protectedProcedure
    .input(
      z.object({
        doctorId: z.string(),
        date: z.date(),
        notes: z.string().optional(),
        severity: z.enum(["low", "medium", "high", "critical"]).optional(),
        paymentId: z.string(), // Payment ID after successful payment
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { clerkId } = ctx.user;

      // Verify the payment was successful
      const user = await db
        .select()
        .from(users)
        .where(eq(users.clerkId, clerkId))
        .limit(1);

      if (!user.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      const userId = user[0].id;

      // Check if payment exists and is completed
      const payment = await db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.id, input.paymentId),
            eq(payments.patientId, userId),
            eq(payments.status, "completed")
          )
        )
        .limit(1);

      if (!payment.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Valid payment not found",
        });
      }
      // get active subscription type if type is single appointment then check if remaining appointments are greater than 0
      // if not return error
      const [counts] = await db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.patientId, userId),
            eq(payments.status, "completed"),
            isNull(payments),
            eq(payments.paymentType, "single")
          )
        );
      if (counts) {
        if (counts.remainingAppointments <= 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No remaining appointments",
          });
        }
      }
      console.log(`Counts`, counts);
      // decrement remaining appointments
      await db
        .update(payments)
        .set({
          remainingAppointments: sql`${payments.remainingAppointments} - 1`, // Decrement by 1
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(payments.id, counts.id),
            gt(payments.remainingAppointments, 0) // Ensure it doesn't go negative
          )
        );
      // Create the appointment
      const newAppointment = await db
        .insert(appointments)
        .values({
          patientId: clerkId,
          doctorId: input.doctorId,
          date: input.date,
          notes: input.notes,
          severity: input.severity || "low",
        })
        .returning();

      return {
        success: true,
        appointment: newAppointment[0],
      };
    }),

  updateAppointment: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        date: z.date().optional(),
        notes: z.string().optional(),
        status: z
          .enum(["scheduled", "completed", "canceled", "rescheduled"])
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const clerkId = ctx.clerkUserId || "";
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.clerkId, clerkId))
          .limit(1);
        if (!user) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found - Update Appointment",
          });
        }
        const userId = user.id;
        const updatedAppointment = await db
          .update(appointments)
          .set({
            date: input.date,
            notes: input.notes,
            status: input.status,
          })
          .where(
            and(
              eq(appointments.id, input.id),
              eq(appointments.patientId, userId)
            )
          )
          .returning();
        console.log(`Updated Appointment`, updatedAppointment);

        return updatedAppointment;
      } catch (error: any) {
        console.log(error.stack);
        console.error(error);
        return {
          success: false,
          error: error.message,
        };
      }
    }),

  deleteAppointment: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { clerkId } = ctx.user;

      const deletedAppointment = await db
        .delete(appointments)
        .where(
          and(
            eq(appointments.id, input.id),
            eq(appointments.patientId, clerkId)
          )
        )
        .returning();

      return deletedAppointment;
    }),

  getMedicalRecords: protectedProcedure
    .input(z.object({ limit: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const { clerkId } = ctx.user;

      const medicalRecordsData = await db
        .select({
          id: medicalRecords.id,
          doctorName: users.firstName,
          diagnosis: medicalRecords.diagnosis,
          treatment: medicalRecords.treatment,
          recordDate: medicalRecords.recordDate,
        })
        .from(medicalRecords)
        .leftJoin(users, eq(medicalRecords.doctorId, users.id))
        .where(eq(medicalRecords.patientId, clerkId))
        .orderBy(desc(medicalRecords.recordDate))
        .limit(input.limit || 10);

      return medicalRecordsData;
    }),

  getPrescriptions: protectedProcedure
    .input(z.object({ limit: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const { clerkId } = ctx.user;

      const prescriptionsData = await db
        .select({
          id: prescriptions.id,
          medication: prescriptions.medication,
          dosage: prescriptions.dosage,
          instructions: prescriptions.instructions,
          startDate: prescriptions.startDate,
          endDate: prescriptions.endDate,
        })
        .from(prescriptions)
        .leftJoin(
          medicalRecords,
          eq(prescriptions.medicalRecordId, medicalRecords.id)
        )
        .where(eq(medicalRecords.patientId, clerkId))
        .orderBy(desc(prescriptions.startDate))
        .limit(input.limit || 10);

      return prescriptionsData;
    }),

  getDoctors: protectedProcedure.query(async () => {
    const doctors = await db
      .select()
      .from(users)
      .where(eq(users.role, "doctor"));
    return doctors;
  }),

  checkPaymentRequirement: protectedProcedure.query(async ({ ctx }) => {
    const { clerkId } = ctx.user;

    // Check if user has active subscription
    const paymentStatus = await checkPaymentStatus(clerkId);

    return {
      requiresPayment:
        !paymentStatus.hasActivePayment ||
        paymentStatus.paymentType !== "subscription",
    };
  }),
});
