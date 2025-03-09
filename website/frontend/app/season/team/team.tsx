import { twMerge } from "tailwind-merge";
import type { Route } from "./+types/team";

export default function Team({ loaderData }: Route.ComponentProps) {
  const leadershipTeam = loaderData.players.filter((p) => p.role !== "Player");

  const playingMembers = loaderData.players.filter((p) => p.role !== "Coach");

  return (
    <>
      <h2>{loaderData.name}</h2>
      {leadershipTeam.map((l) => (
        <div key={l.id}>
          <span className="font-bold">{l.role}</span> {l.name}
        </div>
      ))}
      <table className="border border-collapse text-center">
        <thead className="border">
          <tr>
            <th className="px-2">Player</th>
            <th className="px-2">Differential</th>
            <th className="px-2">Wins</th>
            <th className="px-2">Act-W</th>
            <th className="px-2">Losses</th>
            <th className="px-2">Act-L</th>
            <th className="px-2">Ties</th>
            <th className="px-2">Star Points</th>
            <th className="px-2">Star Rating</th>
          </tr>
        </thead>
        <tbody>
          {playingMembers.map((player) => (
            <tr key={player.id}>
              <td
                className={twMerge(
                  "px-2",
                  player.role === "Captain" && "font-bold"
                )}
              >
                {player.name}
              </td>
              <td>
                {player.wins +
                  player.act_wins -
                  player.losses -
                  player.act_losses}
              </td>
              <td>{player.wins}</td>
              <td>{player.act_wins}</td>
              <td>{player.losses}</td>
              <td>{player.act_losses}</td>
              <td>{player.ties}</td>
              <td>{player.star_points}</td>
              <td>{player.stars.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

type TeamQuery = {
  id: number;
  name: string;
  color: string;
  wins: number;
  losses: number;
  ties: number;
  points: number;
  battle_differential: number;
  players: {
    name: string;
    id: string;
    wins: number;
    act_wins: number;
    losses: number;
    act_losses: number;
    ties: number;
    star_points: number;
    stars: number;
    role: string;
  }[];
};

export async function loader({ params: { season, teamId } }: Route.LoaderArgs) {
  return (await (
    await fetch(`https://mushileague.gg/api/season/${season}/team/${teamId}`)
  ).json()) as TeamQuery;
}
