import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  route("/", "./welcome/welcome.tsx"),
  route("season/:season", "./season/season.tsx", [
    route("team/:teamId", "./season/team/team.tsx"),
    route("schedule", "./season/schedule/schedule.tsx"),
    route("standings", "./season/standings/standings.tsx"),
    route("players", "./season/players/players.tsx"),
    route("draft", "./season/draft/draft.tsx"),
  ]),
] satisfies RouteConfig;
