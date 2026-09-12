"use client";

import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function TermsSignDialog({
  error,
  onCancel,
  onSign,
  open,
  pending,
}: {
  error: string | null;
  onCancel: () => void;
  onSign: () => void;
  open: boolean;
  pending: boolean;
}) {
  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !pending) onCancel();
      }}
      open={open}
    >
      <DialogContent
        className="gap-6 p-6 sm:max-w-[400px] sm:p-8"
        initialFocus={false}
        showCloseButton={false}
      >
        <DialogHeader className="gap-2">
          <DialogTitle className="text-balance text-xl font-semibold leading-tight tracking-tight">
            Sign terms and conditions
          </DialogTitle>
          <DialogDescription className="text-pretty leading-6">
            Sign a wallet message to agree to the Gasport{" "}
            <Link href="/terms" target="_blank" rel="noreferrer">
              Terms of Use
            </Link>
            . Signing is free and does not submit a transaction.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p
            aria-live="polite"
            className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            <CircleAlert
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
            {error}
          </p>
        )}
        <DialogFooter className="flex-col-reverse gap-3 sm:grid sm:grid-cols-2">
          <Button
            className="w-full rounded-full active:scale-[0.96] transition-transform"
            disabled={pending}
            onClick={onCancel}
            size="sm"
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            className="w-full rounded-full active:scale-[0.96] transition-transform"
            disabled={pending}
            onClick={onSign}
            size="sm"
            type="button"
          >
            {pending ? "Waiting for wallet…" : "Sign & continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
