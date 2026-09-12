import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Surfaces use a hairline ring plus a soft tinted shadow — NOT `border` and
 * `shadow` together. A 1px hard border competing with a shadow at the same
 * weight is the clearest "not premium" tell; the nicest surface in the app
 * (HeroCarousel's fanned book stack) already used ring + shadow.
 *
 * `interactive` is opt-in on purpose: of ~31 Card call sites most are static
 * panels that should not lift on hover.
 */
const cardVariants = cva(
  "rounded-2xl bg-card text-card-foreground ring-1 ring-foreground/[0.06] shadow-rest",
  {
    variants: {
      interactive: {
        true: "transition-[box-shadow,transform,--tw-ring-color] duration-base ease-out-soft hover:-translate-y-0.5 hover:ring-foreground/10 hover:shadow-lift",
        false: "",
      },
    },
    defaultVariants: { interactive: false },
  }
);

const Card = React.forwardRef(({ className, interactive, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(cardVariants({ interactive }), className)}
    {...props}
  />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("text-h3 font-semibold", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
