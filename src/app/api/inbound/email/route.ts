import { handleInbound } from "@/modules/enquiries";
export const maxDuration = 60;

export function POST(request: Request) {
  return handleInbound(request, "email");
}
