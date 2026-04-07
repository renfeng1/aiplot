"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { maintenanceNotice } from "@/lib/maintenance";

export function MaintenanceNotice() {
  const [open, setOpen] = useState(true);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[calc(100%-2rem)] sm:max-w-lg"
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{maintenanceNotice.title}</DialogTitle>
          <DialogDescription className="leading-7">
            {maintenanceNotice.description}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm leading-7 text-muted-foreground">
          {maintenanceNotice.details.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
        <DialogFooter>
          <Button type="button" className="rounded-full" onClick={() => setOpen(false)}>
            我知道了
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
