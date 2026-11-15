"use client";

import { useActionState, useEffect, useState } from "react";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveAvailability } from "@/features/availability/actions";
import { fieldNames, TIME_HINT, WEEKDAYS } from "@/features/availability/schema";
import { initialAvailabilityState } from "@/features/availability/state";

export interface DayValues {
  open: boolean;
  opens: string;
  closes: string;
}

// The weekly editor (AVAIL-01, AVAIL-02): for each weekday a switch (open or
// closed), an opening time and a closing time, one window per day (DB9). A closed
// day keeps what was typed but sends nothing. Times are in the workspace's time
// zone, which the page names. When `readOnly` (a locked resource) everything is
// shown but cannot be changed.
export function AvailabilityEditor({
  resourceId,
  initial,
  timeZone,
  readOnly,
}: {
  resourceId: string;
  initial: Record<number, DayValues>;
  timeZone: string;
  readOnly: boolean;
}) {
  const [state, action, pending] = useActionState(saveAvailability, initialAvailabilityState);
  const [days, setDays] = useState(initial);

  const set = (n: number, patch: Partial<DayValues>) => setDays((d) => ({ ...d, [n]: { ...d[n], ...patch } }));

  // After a failed save, move focus to the first field with a problem (Phase 10 review
  // finding 11): with seven days on a phone the error may be far off-screen. A new
  // state object arrives after every save, so this runs once per failed save.
  useEffect(() => {
    if (!state.fieldErrors) return;
    for (const { n } of WEEKDAYS) {
      const names = fieldNames(n);
      const bad = [names.opens, names.closes].find((name) => state.fieldErrors?.[name]);
      if (bad) {
        document.getElementById(bad)?.focus();
        return;
      }
    }
  }, [state]);

  return (
    <form action={action} className="grid max-w-2xl gap-4" noValidate>
      <input type="hidden" name="id" value={resourceId} />

      {state.message ? (
        <FormMessage tone={state.status === "success" ? "success" : "error"} testId="availability-message">
          {state.message}
        </FormMessage>
      ) : null}

      <p id="time-hint" className="text-sm text-muted-foreground">
        {TIME_HINT} Times are in the workspace&apos;s time zone,{" "}
        <strong className="font-medium text-foreground">{timeZone}</strong>. Each day has one opening window.
      </p>

      <div className="grid gap-3">
        {WEEKDAYS.map(({ n, name }) => {
          const names = fieldNames(n);
          const day = days[n];
          const opensError = state.fieldErrors?.[names.opens];
          const closesError = state.fieldErrors?.[names.closes];
          return (
            <fieldset key={n} className="grid gap-2 rounded-lg border border-border p-3" data-testid={`day-${n}`}>
              <legend className="px-1 text-sm font-medium">{name}</legend>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name={names.open}
                    checked={day.open}
                    disabled={readOnly}
                    onChange={(e) => set(n, { open: e.target.checked })}
                    className="size-4"
                  />
                  Open on {name}
                </label>
                <div className="flex flex-wrap items-start gap-3">
                  <div className="grid gap-1">
                    <label htmlFor={`opens-${n}`} className="text-sm">
                      {name} opens at
                    </label>
                    <Input
                      id={`opens-${n}`}
                      name={names.opens}
                      value={day.opens}
                      onChange={(e) => set(n, { opens: e.target.value })}
                      disabled={readOnly || !day.open}
                      autoComplete="off"
                      inputMode="text"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      pattern="[0-9]{1,2}:?[0-9]{2}"
                      placeholder="09:00"
                      aria-invalid={opensError ? true : undefined}
                      aria-describedby={opensError ? `time-hint opens-${n}-error` : "time-hint"}
                      className="h-10 w-28 text-base md:text-sm"
                    />
                    {opensError ? (
                      <p id={`opens-${n}-error`} role="alert" className="max-w-xs text-sm text-destructive">
                        {opensError}
                      </p>
                    ) : null}
                  </div>
                  <div className="grid gap-1">
                    <label htmlFor={`closes-${n}`} className="text-sm">
                      {name} closes at
                    </label>
                    <Input
                      id={`closes-${n}`}
                      name={names.closes}
                      value={day.closes}
                      onChange={(e) => set(n, { closes: e.target.value })}
                      disabled={readOnly || !day.open}
                      autoComplete="off"
                      inputMode="text"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      pattern="[0-9]{1,2}:?[0-9]{2}"
                      placeholder="17:00"
                      aria-invalid={closesError ? true : undefined}
                      aria-describedby={closesError ? `time-hint closes-${n}-error` : "time-hint"}
                      className="h-10 w-28 text-base md:text-sm"
                    />
                    {closesError ? (
                      <p id={`closes-${n}-error`} role="alert" className="max-w-xs text-sm text-destructive">
                        {closesError}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </fieldset>
          );
        })}
      </div>

      {readOnly ? null : (
        <div>
          <Button type="submit" className="h-10 sm:h-8" disabled={pending}>
            {pending ? "Saving…" : "Save opening hours"}
          </Button>
        </div>
      )}
    </form>
  );
}
