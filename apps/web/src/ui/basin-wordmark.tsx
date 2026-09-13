import Image from "next/image";

import darkBackgroundWordmark from "../../../../assets/images/basin-dark-bg.png";
import lightBackgroundWordmark from "../../../../assets/images/basin-light-bg.png";

type BasinWordmarkProps = {
  className?: string;
};

export function BasinWordmark({ className = "" }: BasinWordmarkProps) {
  return (
    <span className={`inline-flex ${className}`}>
      <Image
        src={lightBackgroundWordmark}
        alt="Basin"
        className="h-auto w-full dark:hidden"
        priority
      />
      <Image
        src={darkBackgroundWordmark}
        alt="Basin"
        className="hidden h-auto w-full dark:block"
        priority
      />
    </span>
  );
}
