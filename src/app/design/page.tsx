import type { Metadata } from "next";
import { CalendarXIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { FormField } from "@/components/form-field";
import { PageSkeleton } from "@/components/loading-skeletons";
import { Pagination } from "@/components/pagination";
import { PlaceholderNotice } from "@/components/placeholder-notice";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { StatusBadge } from "@/components/status-badge";
import { ToastDemo } from "./toast-demo";

// A reference page for the design system: tokens, components and the shared
// states in one place. It is for people building SlotMate, not for visitors.
export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false },
};

const SWATCHES = [
  ["background", "bg-background"],
  ["card", "bg-card"],
  ["muted", "bg-muted"],
  ["primary", "bg-primary"],
  ["secondary", "bg-secondary"],
  ["destructive", "bg-destructive"],
  ["border", "bg-border"],
  ["ring", "bg-ring"],
] as const;

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="grid gap-4">
      <h2 id={id} className="font-heading text-xl font-semibold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function DesignPage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="mx-auto grid w-full max-w-5xl flex-1 gap-12 px-4 py-10 sm:px-6">
        <div className="grid gap-3">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Design system</h1>
          <p className="text-muted-foreground">
            Colours, components and the shared states used across SlotMate. Switch the theme in the header to check light and dark.
          </p>
          <PlaceholderNotice phase="Phase 6 (this page is a reference, not a product screen)" />
        </div>

        <Section id="colours" title="Colour tokens">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SWATCHES.map(([name, cls]) => (
              <li key={name} className="grid gap-1.5">
                <span className={`h-12 rounded-lg border border-border ${cls}`} />
                <span className="text-xs text-muted-foreground">{name}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status="pending" />
            <StatusBadge status="approved" />
            <StatusBadge status="rejected" />
            <StatusBadge status="cancelled" />
          </div>
        </Section>

        <Section id="buttons" title="Buttons and badges">
          <div className="flex flex-wrap gap-2">
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">
              <Trash2Icon aria-hidden="true" /> Destructive
            </Button>
            <Button variant="link">Link</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="destructive">Destructive</Badge>
          </div>
        </Section>

        <Section id="forms" title="Form fields">
          <Card>
            <CardContent className="grid gap-4 pt-4 sm:grid-cols-2">
              <FormField id="d-name" label="Name" hint="As it should appear on the booking.">
                {(props) => <Input {...props} className="h-10 text-base md:text-sm" />}
              </FormField>
              <FormField id="d-email" label="Email" error="Enter a valid email address.">
                {(props) => <Input {...props} defaultValue="not-an-email" className="h-10 text-base md:text-sm" />}
              </FormField>
              <FormField id="d-select" label="Theme">
                {(props) => (
                  <Select defaultValue="light">
                    <SelectTrigger {...props} className="h-10 w-full sm:h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField id="d-note" label="Note" optional>
                {(props) => <Textarea {...props} rows={3} className="text-base md:text-sm" />}
              </FormField>
              <div className="flex items-center gap-3">
                <Switch id="d-switch" defaultChecked />
                <Label htmlFor="d-switch">Available for booking</Label>
              </div>
            </CardContent>
          </Card>
        </Section>

        <Section id="overlays" title="Dialogs, confirmations and toasts">
          <div className="flex flex-wrap gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">Open a dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>A dialog</DialogTitle>
                  <DialogDescription>Focus stays inside until you close it with the button or the Escape key.</DialogDescription>
                </DialogHeader>
                <Input aria-label="Sample field" className="h-10 text-base md:text-sm" />
              </DialogContent>
            </Dialog>
            <ConfirmDialog
              trigger={
                <Button variant="destructive">
                  <Trash2Icon aria-hidden="true" /> Delete something
                </Button>
              }
              title="Delete this item?"
              description="This permanently deletes the item and everything inside it. This cannot be undone."
            />
          </div>
          <ToastDemo />
        </Section>

        <Section id="tabs-table" title="Tabs and table">
          <Tabs defaultValue="all">
            <TabsList aria-label="Sample filter">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="pending">Pending</TabsTrigger>
            </TabsList>
            <TabsContent value="all" className="pt-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Visitor</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>Sample visitor</TableCell>
                    <TableCell>
                      <StatusBadge status="approved" />
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="pending" className="pt-3 text-sm text-muted-foreground">
              Pending requests would be listed here.
            </TabsContent>
          </Tabs>
        </Section>

        <Section id="states" title="Shared states">
          <h3 className="text-sm font-medium text-muted-foreground">Empty</h3>
          <EmptyState
            icon={CalendarXIcon}
            headingLevel={4}
            title="No bookings yet"
            description="When visitors send requests they will appear here."
            action={
              <Button className="h-10">
                <PlusIcon aria-hidden="true" /> Share your booking page
              </Button>
            }
          />
          <h3 className="text-sm font-medium text-muted-foreground">Error</h3>
          {/* live={false}: a static sample must not be announced as a real error. */}
          <ErrorState live={false} headingLevel={4} action={<Button className="h-10">Try again</Button>} />
          <h3 className="text-sm font-medium text-muted-foreground">Loading</h3>
          {/* Hidden from screen readers: a static sample must not announce "Loading". */}
          <div aria-hidden="true">
            <PageSkeleton />
          </div>
          <Skeleton className="h-4 w-40" />
        </Section>

        <Section id="pagination" title="Pagination (20 per page)">
          <Pagination page={2} totalItems={135} buildHref={(p) => `/design?page=${p}`} />
          <Separator />
          <p className="text-sm text-muted-foreground">
            Lists show 20 items per page (decision D21). The page number is kept in the address, for example <code className="font-mono">?page=2</code>.
          </p>
        </Section>

        <Card>
          <CardHeader>
            <CardTitle>Not-found and error pages</CardTitle>
            <CardDescription>
              Visit any address that does not exist, for example <code className="font-mono">/nothing-here</code>, to see the 404 page.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
      <SiteFooter />
    </>
  );
}
