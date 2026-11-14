import type { Metadata } from "next";
import { CopyIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { PlaceholderNotice } from "@/components/placeholder-notice";

export const metadata: Metadata = { title: "Widget" };

// The code the owner will copy (EMBED-01/02/07). A sample address, not a real one.
const EMBED_CODE = `<iframe
  src="https://example.com/embed/sample-workspace"
  title="Book with SlotMate"
  width="100%"
  height="640"
  style="border:0"
></iframe>`;

export default function WidgetPage() {
  return (
    <>
      <PageHeader
        title="Widget"
        description="Show your booking page on another website with a snippet you paste in."
      />
      <PlaceholderNotice phase="Phase 14" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Choose how the widget looks.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="widget-theme">Theme</Label>
              <Select defaultValue="light" disabled>
                <SelectTrigger id="widget-theme" className="h-10 w-full sm:h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="widget-layout" className="flex items-center gap-2">
                Layout <Badge variant="secondary">Pro</Badge>
              </Label>
              <Select defaultValue="list" disabled>
                <SelectTrigger id="widget-layout" className="h-10 w-full sm:h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="list">List</SelectItem>
                  <SelectItem value="grid">Grid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="widget-background" className="flex items-center gap-2">
                Background colour <Badge variant="secondary">Pro</Badge>
              </Label>
              <Input id="widget-background" placeholder="#ffffff" disabled className="h-10 text-base md:text-sm" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Live preview</CardTitle>
            <CardDescription>This is how visitors will see it (sketch).</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              aria-hidden="true"
              className="grid gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-4"
            >
              <span className="h-4 w-1/2 rounded bg-foreground/20" />
              <span className="h-10 rounded-lg border border-border bg-card" />
              <span className="h-10 rounded-lg border border-border bg-card" />
              <span className="h-9 w-1/3 rounded-lg bg-primary/70" />
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Embed code</CardTitle>
          <CardDescription>Copy this into the page where the widget should appear.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <pre
            tabIndex={0}
            role="region"
            aria-label="Embed code"
            className="overflow-x-auto rounded-lg border border-border bg-muted p-4 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <code>{EMBED_CODE}</code>
          </pre>
          <div>
            <Button variant="outline" className="h-10 sm:h-8" disabled>
              <CopyIcon aria-hidden="true" /> Copy code
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
