"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

export function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}
