import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Düğmeler (DESIGN.md): 8px yarıçap, 40px standart yükseklik (32px yoğun tablolar, 48px mobil ana eylem).
 * Birincil = Electric Volt (koyuda limon zemin + koyu metin, açıkta #5E8A00 + beyaz).
 * Yıkıcı = %10 gül zemin + %25 kenarlık. Gölge/parlama YOK.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        // Yapısal ikincil: yüzey + kenarlık
        outline:
          "border-border bg-surface-2 text-foreground hover:bg-surface-3 aria-expanded:bg-surface-3",
        secondary: "bg-secondary text-secondary-foreground hover:bg-surface-3",
        ghost: "text-muted-foreground hover:bg-accent hover:text-foreground aria-expanded:bg-accent",
        destructive:
          "border-destructive-border bg-destructive-soft text-destructive hover:bg-[color-mix(in_srgb,var(--destructive)_20%,transparent)]",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4",
        xs: "h-6 gap-1 px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3 text-[0.8rem] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 px-5 text-base",
        icon: "size-10",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
