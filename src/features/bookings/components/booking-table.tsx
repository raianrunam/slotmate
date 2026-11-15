import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { whenLabel } from "@/features/bookings/format";
import type { BookingListRow } from "@/features/bookings/queries";

// The booking list (BOOK-01). Times are in the workspace's zone, and the zone is named in each row.
// On a phone the Resource, Workspace and Date columns are hidden, so their content moves under the name.
export function BookingTable({ rows }: { rows: BookingListRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Visitor</TableHead>
          <TableHead className="hidden sm:table-cell">Resource</TableHead>
          <TableHead className="hidden md:table-cell">Workspace</TableHead>
          <TableHead className="hidden sm:table-cell">Date and time</TableHead>
          <TableHead className="hidden md:table-cell">Attendees</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const when = whenLabel(row.starts_at, row.ends_at, row.timeZone);
          return (
            <TableRow key={row.id} data-testid="booking-row">
              <TableCell className="whitespace-normal font-medium">
                <Link href={`/dashboard/bookings/${row.id}`} className="underline-offset-4 hover:underline focus-visible:underline">
                  {row.visitor_name}
                </Link>
                <span className="block text-xs font-normal text-muted-foreground sm:hidden">
                  {row.resourceName} · {when.date}, {when.range} ({when.zone})
                </span>
              </TableCell>
              <TableCell className="hidden sm:table-cell">{row.resourceName}</TableCell>
              <TableCell className="hidden md:table-cell">{row.workspaceName}</TableCell>
              <TableCell className="hidden sm:table-cell">
                {when.date}, {when.range}
                <span className="block text-xs text-muted-foreground">{when.zone}</span>
              </TableCell>
              <TableCell className="hidden md:table-cell">{row.attendees}</TableCell>
              <TableCell>
                <StatusBadge status={row.status} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
