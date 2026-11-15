"use client";

import { useActionState, useRef, useState } from "react";
import { ImageIcon } from "lucide-react";
import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { removeImage, uploadResourceImage } from "@/features/resources/actions";
import { IMAGE_MESSAGES, MAX_IMAGE_BYTES } from "@/features/resources/image-validation";
import { initialResourceState, type ResourceFormState } from "@/features/resources/state";

// The resource image (RES-05). The browser only helps (accept list, an early
// size message so a huge file is not sent at all); the SERVER decides: it checks
// the size and the file's real signature again (S1).
export function ImageSection({
  resourceId,
  resourceName,
  imageUrl,
  locked,
}: {
  resourceId: string;
  resourceName: string;
  /** The public address of the current image, or null. */
  imageUrl: string | null;
  locked: boolean;
}) {
  // One state for both forms, so the message always belongs to the LAST action
  // (upload or remove). Both are Server Actions that check the owner themselves.
  const [state, action, working] = useActionState(
    (prev: ResourceFormState, formData: FormData) =>
      formData.get("intent") === "remove" ? removeImage(prev, formData) : uploadResourceImage(prev, formData),
    initialResourceState,
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const message = localError ?? state.message;
  const isError = localError !== null || state.status === "error";

  return (
    <section aria-labelledby="image-heading" className="grid max-w-xl gap-3 border-t border-border pt-5">
      <h2 id="image-heading" className="font-heading text-base font-medium">
        Image
      </h2>

      {imageUrl ? (
        // A plain <img>: the file is public and already small; no image optimiser is needed.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={`Image of ${resourceName}`}
          data-testid="resource-image"
          className="max-h-60 w-full max-w-sm rounded-lg border border-border object-cover"
        />
      ) : (
        <div
          data-testid="resource-image-placeholder"
          className="flex h-32 w-full max-w-sm items-center justify-center rounded-lg border border-dashed border-border bg-muted/40 text-sm text-muted-foreground"
        >
          <ImageIcon className="mr-2 size-5" aria-hidden="true" /> No image
        </div>
      )}

      {message ? (
        <FormMessage tone={isError ? "error" : "success"} testId="image-message">
          {message}
        </FormMessage>
      ) : null}

      {locked ? (
        <p className="text-sm text-muted-foreground">
          This resource is locked, so its image cannot be changed.
        </p>
      ) : (
        <>
          <form
            action={action}
            className="grid gap-3"
            onSubmit={(e) => {
              const file = fileRef.current?.files?.[0];
              if (!file) {
                e.preventDefault();
                setLocalError(IMAGE_MESSAGES.missing);
              } else if (file.size > MAX_IMAGE_BYTES) {
                e.preventDefault();
                setLocalError(IMAGE_MESSAGES.tooLarge);
              } else {
                setLocalError(null);
              }
            }}
            noValidate
          >
            <input type="hidden" name="id" value={resourceId} />
            <FormField
              id="res-image"
              label={imageUrl ? "Replace the image" : "Upload an image"}
              hint="JPG, PNG or WebP, 2 MB at most."
            >
              {(props) => (
                <Input
                  {...props}
                  ref={fileRef}
                  name="image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={() => setLocalError(null)}
                  className="h-10 text-base md:text-sm"
                />
              )}
            </FormField>
            <div>
              <Button type="submit" className="h-10 sm:h-8" disabled={working}>
                {working ? "Uploading…" : imageUrl ? "Replace image" : "Upload image"}
              </Button>
            </div>
          </form>
          {imageUrl ? (
            <form action={action}>
              <input type="hidden" name="id" value={resourceId} />
              <input type="hidden" name="intent" value="remove" />
              <Button type="submit" variant="outline" className="h-10 sm:h-8" disabled={working}>
                Remove image
              </Button>
            </form>
          ) : null}
        </>
      )}
    </section>
  );
}
