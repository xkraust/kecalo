"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "relative inline-flex h-[22px] w-10 shrink-0 cursor-pointer items-center rounded-full bg-secondary transition-colors outline-none data-[checked]:bg-primary focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="block size-[18px] translate-x-0.5 rounded-full bg-background shadow-sm transition-transform data-[checked]:translate-x-[20px]"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
