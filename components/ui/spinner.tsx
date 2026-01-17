import { cn } from "@/lib/utils"

function Spinner({
  size = "md",
  className,
  ...props
}: React.ComponentProps<"div"> & { size?: "sm" | "md" | "lg" }) {
  return (
    <div
      data-slot="spinner"
      className={cn(
        "rounded-full border-2 border-primary border-t-transparent animate-spin",
        size === "sm" && "size-4",
        size === "md" && "size-8",
        size === "lg" && "size-12",
        className
      )}
      {...props}
    />
  )
}

export { Spinner }
