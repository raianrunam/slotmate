"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { SparklesIcon } from "lucide-react";
import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveWidgetOptions } from "@/features/embed/actions";
import { COLOR_PATTERN, type EmbedOptions } from "@/features/embed/schema";
import { initialWidgetState } from "@/features/embed/state";
import { PLANS } from "@/lib/plans";

const radioClass = "size-4 accent-[var(--primary)]";

// The widget options of one workspace. Free owners see the Pro options disabled (a disabled
// field is not sent), with an upgrade prompt; the server and the database refuse a forged
// Pro-only save anyway. A locked workspace is read-only.
export function WidgetForm({
  workspaceId,
  saved,
  isPro,
  locked,
}: {
  workspaceId: string;
  saved: EmbedOptions;
  isPro: boolean;
  locked: boolean;
}) {
  const [state, action, pending] = useActionState(saveWidgetOptions, initialWidgetState);
  const [color, setColor] = useState(saved.backgroundColor ?? "");
  const colorHint = color !== "" && !COLOR_PATTERN.test(color) ? "Use a colour like #1a2b3c." : undefined;
  const proDisabled = !isPro || locked;

  return (
    <form action={action} className="grid gap-5" noValidate data-testid="widget-form">
      <input type="hidden" name="workspaceId" value={workspaceId} />

      {locked ? (
        <FormMessage tone="info" testId="widget-locked">
          This workspace is locked after a plan downgrade, so its widget options are read-only.
        </FormMessage>
      ) : null}
      {state.status === "saved" && state.message ? (
        <FormMessage tone="success" testId="widget-saved">
          {state.message}
        </FormMessage>
      ) : null}
      {state.status === "error" && state.message ? (
        <FormMessage tone="error" testId="widget-error">
          {state.message}
        </FormMessage>
      ) : null}

      <fieldset className="grid gap-2" disabled={locked}>
        <legend className="text-sm font-medium">Theme</legend>
        {(["light", "dark"] as const).map((theme) => (
          <label key={theme} className="flex items-center gap-2 text-sm">
            <input type="radio" name="theme" value={theme} defaultChecked={saved.theme === theme} className={radioClass} />
            {theme === "light" ? "Light" : "Dark"}
          </label>
        ))}
        {state.fieldErrors?.theme ? <p className="text-sm text-destructive">{state.fieldErrors.theme}</p> : null}
      </fieldset>

      <fieldset className="grid gap-2" disabled={proDisabled} data-testid="widget-layout-group">
        <legend className="flex items-center gap-2 text-sm font-medium">
          Layout <Badge variant="secondary">Pro</Badge>
        </legend>
        {(["list", "grid"] as const).map((layout) => (
          <label key={layout} className="flex items-center gap-2 text-sm">
            <input type="radio" name="layout" value={layout} defaultChecked={saved.layout === layout} className={radioClass} />
            {layout === "list" ? "List (one column)" : "Grid (two columns on wide screens)"}
          </label>
        ))}
        {state.fieldErrors?.layout ? <p className="text-sm text-destructive">{state.fieldErrors.layout}</p> : null}
      </fieldset>

      <FormField
        id="widget-background"
        label="Background colour"
        optional
        error={state.fieldErrors?.backgroundColor ?? colorHint}
        hint={
          <span className="inline-flex items-center gap-2">
            <Badge variant="secondary">Pro</Badge> A colour like #1a2b3c. Leave empty for the theme&apos;s own colour.
          </span>
        }
      >
        {(props) => (
          <Input
            {...props}
            name="backgroundColor"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="#ffffff"
            disabled={proDisabled}
            autoComplete="off"
            spellCheck={false}
            maxLength={7}
            className="h-10 max-w-48 font-mono text-base md:text-sm"
          />
        )}
      </FormField>

      {!isPro && !locked ? (
        <div role="note" data-testid="widget-upgrade" className="grid gap-3 rounded-xl border border-border bg-card p-4 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <SparklesIcon className="size-4 text-primary" aria-hidden="true" />
            Grid layout and background colour are Pro options
          </p>
          <p className="text-muted-foreground">
            {PLANS.pro.name} gives you a customizable widget. Your theme choice works on every plan.
          </p>
          <div>
            <Button asChild variant="outline" className="h-10 sm:h-8">
              <Link href="/dashboard/billing">See Pro</Link>
            </Button>
          </div>
        </div>
      ) : null}

      {!locked ? (
        <div>
          <Button type="submit" className="h-10 sm:h-8" disabled={pending}>
            {pending ? "Saving…" : "Save widget options"}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
