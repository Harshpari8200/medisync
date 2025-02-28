"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs"
import { User2Icon } from 'lucide-react'

import { Button } from "@/components/ui/button"
import { UserProfileButton } from "./user-profile-button"
import { MainNav } from "./main-nav"

export function HomeNavbar({ className }: { className?: string }) {
  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="fixed top-0 left-0 right-0 z-50 bg-blue-500"
    >
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <motion.div whileHover={{ scale: 1.05 }} transition={{ type: "spring", stiffness: 400, damping: 10 }}>
            <Link href="/" className="text-3xl font-bold text-white">
              ULTRAMED
            </Link>
          </motion.div>

          <MainNav />

          <div className="flex items-center gap-4">
            <SignedIn>
              <UserProfileButton />
            </SignedIn>
            <SignedOut>
              <SignInButton mode="modal" forceRedirectUrl="/redirect" signUpForceRedirectUrl="/redirect" >
                <Button variant="default" className="bg-blue-600 hover:bg-blue-700 text-white">
                  <User2Icon className="mr-2 h-4 w-4" />
                  Login
                </Button>
              </SignInButton>
            </SignedOut>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
