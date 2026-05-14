"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type TextareaHTMLAttributes,
} from "react";

/**
 * Textarea that grows with its content. The host CSS still caps the height
 * (e.g. `max-h-32`) so vertical scrolling kicks in once the cap is hit.
 *
 * The chat form is uncontrolled, so this component doesn't track value
 * itself. It just observes input events and form.reset to keep the DOM
 * height in sync with the visible content.
 */
type Props = TextareaHTMLAttributes<HTMLTextAreaElement>;

function resize(el: HTMLTextAreaElement | null): void {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

export const AutoGrowTextarea = forwardRef<HTMLTextAreaElement, Props>(
  function AutoGrowTextarea({ onInput, ...rest }, ref) {
    const innerRef = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement);

    useLayoutEffect(() => {
      resize(innerRef.current);
    }, []);

    useEffect(() => {
      const el = innerRef.current;
      const form = el?.form;
      if (!form) return;
      // form.reset clears the value AFTER the event fires; defer one tick.
      const onReset = () => queueMicrotask(() => resize(innerRef.current));
      form.addEventListener("reset", onReset);
      return () => form.removeEventListener("reset", onReset);
    }, []);

    return (
      <textarea
        {...rest}
        ref={innerRef}
        onInput={(e) => {
          resize(e.currentTarget);
          onInput?.(e);
        }}
      />
    );
  },
);
