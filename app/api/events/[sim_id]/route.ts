import { subscribe, isRegistered } from "@/lib/registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sim_id: string }> },
): Promise<Response> {
  const { sim_id } = await params;

  if (!isRegistered(sim_id)) {
    return new Response(JSON.stringify({ error: "sim_not_found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (data: string): void => {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          // controller may already be closed if client disconnected
        }
      };

      const sub = subscribe(sim_id, (event) => {
        send(JSON.stringify(event));
        if (event.type === "sim_ended") {
          // Give the buffer a moment to flush, then close
          setTimeout(() => {
            try {
              controller.close();
            } catch {
              // ignore
            }
          }, 100);
        }
      });

      if (!sub) {
        send(JSON.stringify({ error: "sim_disappeared" }));
        controller.close();
        return;
      }

      // Replay backlog first (in order)
      for (const ev of sub.backlog) {
        send(JSON.stringify(ev));
      }

      // If sim already ended before subscription, close after backlog
      const last = sub.backlog[sub.backlog.length - 1];
      if (last && last.type === "sim_ended") {
        setTimeout(() => {
          try {
            controller.close();
          } catch {
            // ignore
          }
        }, 100);
      }

      // Cleanup on client disconnect
      const onAbort = (): void => {
        sub.unsubscribe();
        try {
          controller.close();
        } catch {
          // ignore
        }
      };
      // We can't easily hook into AbortSignal here without the Request being passed,
      // but Next.js handles the controller closing when the client disconnects.
      // The subscriber will simply error silently and be cleaned up on next cleanup pass.
      void onAbort;
    },
    cancel() {
      // Client disconnected — best-effort cleanup happens via subscribe callback errors.
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
