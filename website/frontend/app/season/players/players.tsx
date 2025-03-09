import type { Route } from "./+types/players";

export default function Players({loaderData}: Route.ComponentProps) {
  return (
    <>
      <h2>Player ratings</h2>
      <table className="border border-collapse">
        <thead className="border">
          <tr>
            <th className="px-2">Rank</th>
            <th className="px-2">Player</th>
            <th className="px-2">Differential</th>
            <th className="px-2">Wins</th>
            <th className="px-2">Act W</th>
            <th className="px-2">Losses</th>
            <th className="px-2">Act L</th>
            <th className="px-2">Ties</th>
            <th className="px-2">Star Points</th>
            <th className="px-2">Star Rank</th>
          </tr>
        </thead>
        <tbody>
          {loaderData.map((player, i) => (
            <tr key={player.id}>
              <td className="px-2 text-center">{i + 1}</td>
              <td className="px-2 py-0.5 font-semibold">{player.name}</td>
              <td className="px-2 text-center">{player.differential}</td>
              <td className="px-2 text-center">{player.wins}</td>
              <td className="px-2 text-center">{player.act_wins}</td>
              <td className="px-2 text-center">{player.losses}</td>
              <td className="px-2 text-center">{player.act_losses}</td>
              <td className="px-2 text-center">{player.ties}</td>
              <td className="px-2 text-center">{player.star_points}</td>
              <td className="px-2 text-center">{player.stars.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
};

type PlayersQuery = {
  id: number;
  name: string;
  differential: number;
  wins: number;
  act_wins: number;
  losses: number;
  act_losses: number;
  ties: number;
  star_points: number;
  stars: number;
}[]

export async function loader({ params: { season } }: Route.LoaderArgs) {
  return (await (
    await fetch(`https://mushileague.gg/api/season/${season}/players`)
  ).json()) as PlayersQuery;
}
