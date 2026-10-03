import type { ReactNode, Ref } from "react";

// Noor's basic phone: dark body, small LCD. Shared by the landing page and the demo.
export function PhoneShell(props: {
  children: ReactNode;
  footer?: ReactNode;
  screenClassName?: string;
  className?: string;
  label?: string;
  screenRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div className={`w-full max-w-[340px] ${props.className ?? ""}`}>
      <div className="rounded-[2.5rem] bg-phone-body p-5 shadow-phone">
        <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-phone-bezel" aria-hidden="true" />
        <div className="rounded-md bg-phone-bezel p-2">
          <div
            ref={props.screenRef}
            className={`lcd-screen overflow-y-auto rounded-sm p-3 text-lg leading-tight ${props.screenClassName ?? "h-[380px]"}`}
            aria-label={props.label}
          >
            <div className="mb-2 flex justify-between border-b border-lcd-ink/40 pb-1 text-base" aria-hidden="true">
              <span>▮▮▮▯ Noor</span>
              <span>SMS</span>
            </div>
            {props.children}
          </div>
        </div>
        {props.footer}
      </div>
    </div>
  );
}
