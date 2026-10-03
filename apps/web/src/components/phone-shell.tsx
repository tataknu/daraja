import type { ReactNode, Ref } from "react";

// Noor's basic phone: dark body, small LCD. Shared by the landing page and the demo.
export function PhoneShell(props: {
  children: ReactNode;
  footer?: ReactNode;
  screenClassName?: string;
  className?: string;
  label?: string;
  screenRef?: Ref<HTMLDivElement>;
  /** On large screens, stretch to the parent's height (the demo fits one screen). */
  fill?: boolean;
}) {
  const fill = props.fill ? "lg:flex lg:min-h-0 lg:flex-1 lg:flex-col" : "";
  return (
    <div className={`w-full max-w-[340px] ${fill} ${props.className ?? ""}`}>
      <div className={`rounded-[2.5rem] bg-phone-body p-5 shadow-phone ${fill}`}>
        <div
          className="mx-auto mb-3 h-1.5 w-16 shrink-0 rounded-full bg-phone-bezel"
          aria-hidden="true"
        />
        <div
          className={`rounded-md bg-phone-bezel p-2 ${props.fill ? "lg:min-h-0 lg:flex-1" : ""}`}
        >
          <div
            ref={props.screenRef}
            className={`lcd-screen overflow-y-auto rounded-sm p-3 text-lg leading-tight ${props.screenClassName ?? "h-[380px]"} ${props.fill ? "lg:h-full lg:min-h-[200px]" : ""}`}
            aria-label={props.label}
          >
            <div
              className="mb-2 flex justify-between border-b border-lcd-ink/40 pb-1 text-base"
              aria-hidden="true"
            >
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
