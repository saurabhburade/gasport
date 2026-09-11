import type { VariantProps } from "class-variance-authority";
import { cn } from "cn";
import type * as React from "react";

import { alertVariants } from "./variants";

export function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}
