import ModeScreen from "../components/ModeScreen";

export default function GameModes() {
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