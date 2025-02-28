"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils"
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu"

const links = [
  { href: "/services", label: "Services" },
  { href: "/doctors", label: "Doctors" },
  { href: "/prices", label: "Prices" },
  { href: "/about", label: "About" },
  { href: "/contacts", label: "Contacts" },
]

export function MainNav({ className }: { className?: string }) {
  const pathname = usePathname()

  return (
    <NavigationMenu>
      <NavigationMenuList>
        {links.map((link) => (
          <NavigationMenuItem key={link.href}>
            <Link href={link.href} legacyBehavior passHref>
              <NavigationMenuLink
                className={cn(
                  navigationMenuTriggerStyle(),
                  "text-sm transition-colors hover:text-blue-600",
                  pathname === link.href ? "text-blue-600 font-semibold" : "text-gray-600",
                )}
              >
                <motion.span
                  whileHover={{ scale: 1.05 }}
                  transition={{ type: "spring", stiffness: 400, damping: 10 }}
                >
                  {link.label}
                </motion.span>
                {pathname === link.href && (
                  <motion.div
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"
                    layoutId="underline"
                  />
                )}
              </NavigationMenuLink>
            </Link>
          </NavigationMenuItem>
        ))}
      </NavigationMenuList>
    </NavigationMenu>
  )
}
