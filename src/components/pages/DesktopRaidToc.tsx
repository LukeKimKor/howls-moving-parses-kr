import { useEffect, useState } from "react";
import type { CharacterData } from "../../types/snapshot.js";
import { CLASS_COLORS } from "../primitives/SpecIcon.js";

export function DesktopRaidToc({ characters }: { characters: CharacterData[] }) {
	const [active, setActive] = useState("raid-summary");
	useEffect(() => {
		const ids = ["raid-summary", ...characters.map((_, i) => `raid-character-${i}`)];
		let frame = 0;
		const update = () => {
			frame = 0;
			let current = ids[0] ?? "raid-summary";
			for (const id of ids) {
				const element = document.getElementById(id);
				if (element && element.getBoundingClientRect().top <= 150) current = id;
			}
			// A short final section cannot always reach the top threshold.
			const pageHeight = document.documentElement.scrollHeight;
			if (
				pageHeight > window.innerHeight &&
				window.scrollY + window.innerHeight >= pageHeight - 2
			) {
				current = ids[ids.length - 1] ?? current;
			}
			setActive(current);
		};
		const onScroll = () => {
			if (!frame) frame = window.requestAnimationFrame(update);
		};
		window.addEventListener("scroll", onScroll, { passive: true });
		window.addEventListener("resize", onScroll);
		update();
		return () => {
			window.removeEventListener("scroll", onScroll);
			window.removeEventListener("resize", onScroll);
			if (frame) window.cancelAnimationFrame(frame);
		};
	}, [characters]);
	return (
		<nav className="desktop-raid-toc" aria-label="공격대 성적 목차">
			<span className="desktop-toc-title">내캐릭 로그관리</span>
			<a href="#raid-summary" aria-current={active === "raid-summary" ? "location" : undefined}>
				종합 요약
			</a>
			<div className="desktop-toc-characters">
				{characters.map((character, index) => {
					const id = `raid-character-${index}`;
					return (
						<a
							key={character.name}
							href={`#${id}`}
							aria-current={active === id ? "location" : undefined}
						>
							<span
								className="toc-class-dot"
								aria-hidden="true"
								style={{ background: CLASS_COLORS[character.class] }}
							/>
							{character.name}
						</a>
					);
				})}
			</div>
		</nav>
	);
}
