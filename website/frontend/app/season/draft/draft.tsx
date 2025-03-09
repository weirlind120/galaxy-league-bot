import { teamInitials } from "~/util/util";
import type { Route } from "./+types/draft";

export default function Draft({ loaderData }: Route.ComponentProps) {
  return (
    <table className="border border-collapse table-fixed w-full">
      <tbody>
        {loaderData.map((round, i) => (
          <tr key={i} className="border">
            <td className="border w-20 p-1">Round {i + 1}</td>
            {round.map((pick, i) => (
              <td className="border" key={i}>
                {pick && (
                  <>
                    <div
                      className="font-bold p-1"
                      style={{ backgroundColor: pick.team.color }}
                    >
                      {teamInitials(pick.team.name)}
                    </div>
                    <div className="text-sm p-1 flex gap-1 justify-between">
                      <div className="whitespace-nowrap overflow-hidden text-ellipsis min-w-0">
                        {pick.player.name}
                      </div>
                      <div className="shrink-0 font-semibold">
                        {pick.player.stars}
                      </div>
                    </div>
                  </>
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type Draft = {
  team: {
    id: number;
    name: string;
    color: string;
  };
  player: {
    id: number;
    name: string;
    stars: number;
  };
}[][];

type DraftQuery = {
  round: number;
  pick_order: number;
  teamId: number;
  teamName: string;
  color: string;
  playerId: number;
  playerName: string;
  stars: number;
}[];

export async function loader({ params: { season } }: Route.LoaderArgs) {
  const rawData = (await (
    await fetch(`https://mushileague.gg/api/season/${season}/draft`)
  ).json()) as DraftQuery;

  const maxRoundLength = rawData.reduce(
    (accum, item) => Math.max(accum, item.pick_order),
    0
  );

  return rawData.reduce((accum, item) => {
    if (item.round > accum.length) {
      accum.push(new Array(maxRoundLength).fill(undefined));
    }
    accum[item.round - 1][item.pick_order - 1] = {
      team: {
        id: item.teamId,
        name: item.teamName,
        color: item.color,
      },
      player: {
        id: item.playerId,
        name: item.playerName,
        stars: item.stars,
      },
    };
    return accum;
  }, [] as Draft);
}
