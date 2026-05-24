import { useRef, useEffect, useState } from "react";

/**
 * ResponsiveSubnav — renders a horizontal tab bar that:
 *  - Desktop: standard inline tabs
 *  - Mobile: scrollable with fade hint + optional dropdown for overflow
 *  - Supports active tab highlight with accent color
 *
 * Props:
 *  - items: Array<{ key: string, label: string|ReactNode, icon?: ReactNode, onClick?: () => void }>
 *  - activeKey: string
 *  - onTabChange?: (key: string) => void
 *  - className?: string
 */
export function ResponsiveSubnav({ items, activeKey, onTabChange, className = "" }) {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  };

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [items]);

  // Scroll active tab into view on mount/change
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const activeEl = el.querySelector(".subnav-tab.active");
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    }
  }, [activeKey]);

  return (
    <div
      className={`subnav${canScrollRight ? " subnav--scrollable" : ""}${className ? ` ${className}` : ""}`}
      ref={scrollRef}
    >
      {items.map((item) => (
        <button
          key={item.key}
          className={`subnav-tab${activeKey === item.key ? " active" : ""}`}
          onClick={() => onTabChange?.(item.key) ?? item.onClick?.()}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}

/**
 * BotHeader — displays the bot name + guild with a Subnav below.
 * Props:
 *  - botName: string
 *  - guildName: string
 *  - botIcon?: ReactNode
 *  - subnavItems, activeKey, onTabChange — forwarded to ResponsiveSubnav
 */
export function BotHeader({ botName, guildName, botIcon, subnavItems, activeKey, onTabChange }) {
  return (
    <div>
      <div className="bot-header">
        <div className="bot-header__name">
          {botIcon}
          {botName}
        </div>
        {guildName && <div className="bot-header__guild">{guildName}</div>}
      </div>
      {subnavItems && (
        <ResponsiveSubnav
          items={subnavItems}
          activeKey={activeKey}
          onTabChange={onTabChange}
        />
      )}
    </div>
  );
}