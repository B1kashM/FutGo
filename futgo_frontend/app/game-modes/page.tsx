import ModeScreen from "../components/ModeScreen";

type SearchParams = { game?: string };

/**
 * One mode picker for both games:
 *   /game-modes              -> Play Draft  (Local / Online)
 *   /game-modes?game=cards   -> Play Cards  (Local / Online)
 */
export default async function GameModes({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const params = (await searchParams) ?? {};

  if (params.game === "cards") {
    return (
      <ModeScreen
        title="Play Cards"
        titleIcon="layers"
        modes={[
          {
            id: "local",
            href: "/cards?mode=local",
            title: "Local",
            tag: "Same device",
            icon: "local",
            variant: "a",
          },
          {
            id: "online",
            href: "/cards?mode=online",
            title: "Online",
            tag: "Room code",
            icon: "online",
            variant: "b",
          },
        ]}
      />
    );
  }

  return (
    <ModeScreen
      title="Play Draft"
      modes={[
        {
          id: "local",
          href: "/local-draft",
          title: "Local",
          tag: "Same device",
          icon: "local",
          variant: "a",
        },
        {
          id: "online",
          href: "/online-draft",
          title: "Online",
          tag: "Room code",
          icon: "online",
          variant: "b",
        },
      ]}
    />
  );
}