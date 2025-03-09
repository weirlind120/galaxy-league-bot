import type { Route } from "./+types/standings";

export default function Standings({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <h2>Regular season standings</h2>
      <table className="border border-collapse">
        <thead className="border">
          <tr>
            <th className="px-2">Rank</th>
            <th className="px-2">Team Name</th>
            <th className="px-2">Points</th>
            <th className="px-2">Record (W-L-T)</th>
            <th className="px-2">Differential</th>
          </tr>
        </thead>
        <tbody>
          {loaderData.map((team, i) => (
            <tr key={team.id}>
              <td className="px-2 text-center">{i + 1}</td>
              <td className="px-2 py-0.5 font-semibold" style={{ backgroundColor: team.color }}>{team.name}</td>
              <td className="px-2 text-center">{team.points}</td>
              <td className="px-2 text-center">{`${team.wins} - ${team.losses} - ${team.ties}`}</td>
              <td className="px-2 text-center">{team.battle_differential}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

type StandingsQuery = {
  id: number;
  name: string;
  color: string;
  wins: number;
  losses: number;
  ties: number;
  battle_differential: number;
  points: number;
}[];

export async function loader({ params: { season } }: Route.LoaderArgs) {
  return (await (
    await fetch(`https://mushileague.gg/api/season/${season}/standings`)
  ).json()) as StandingsQuery;
}
