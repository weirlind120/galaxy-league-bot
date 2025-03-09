import { twMerge } from "tailwind-merge";
import type { Route } from "./+types/schedule";

export default function Schedule({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex flex-col gap-3">
      {loaderData.weeks.map((week, i) => (
        <div className="flex gap-3 w-fit" key={i}>
          {week.map((matchup) => {
            const { leftWins, rightWins } = matchup.pairings.reduce(
              (accum, item) => {
                if (item.leftPlayer.won) {
                  accum.leftWins += 1;
                } else if (item.rightPlayer.won) {
                  accum.rightWins += 1;
                }
                return accum;
              },
              { leftWins: 0, rightWins: 0 }
            );

            const scoreString = `${leftWins} - ${rightWins}`;

            return (
              <table key={matchup.id} className="w-3xl border-collapse border table-fixed">
                <thead>
                  <tr className="h-8">
                    <th
                      className="text-lg font-semibold whitespace-nowrap text-center border"
                      style={{ backgroundColor: matchup.leftTeam.color }}
                    >
                      {matchup.leftTeam.name}
                    </th>
                    <th className="text-lg text-center font-bold border">
                      {scoreString}
                    </th>
                    <th
                      className="text-lg font-semibold whitespace-nowrap text-center border"
                      style={{ backgroundColor: matchup.rightTeam.color }}
                    >
                      {matchup.rightTeam.name}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {matchup.pairings.map((p) => {
                    const gameLinks = p.dead
                      ? [<span key={0} className="basis-full text-center">dead</span>]
                      : p.games.length === 0
                      ? [<span key={0} className="basis-full text-center">act</span>]
                      : p.games.map((game, i) =>
                          game.startsWith("http") ? (
                            <div key={i} className="basis-full flex px-2 not-last:border-r">
                              <a
                                className="basis-full grow text-center underline text-sm text-[blue] active:text-[purple]"
                                href={game}
                              >{`g${i + 1}`}</a>
                            </div>
                          ) : (
                            <span key={i} className="basis-full not-last:border-r text-center">
                              {game}
                            </span>
                          )
                        );
                    while (p.games.length > 0 && gameLinks.length < 3) {
                      gameLinks.push(<span key={2} className="basis-full px-2" />);
                    }
                    return (
                      <tr key={p.leftPlayer.id}>
                        <td
                          className={twMerge(
                            "text-right border pr-2",
                            p.leftPlayer.won && "bg-green-100",
                            p.leftPlayer.lost && "bg-red-100",
                            p.dead && "bg-gray-200"
                          )}
                        >
                          {p.leftPlayer.name}
                        </td>
                        <td className="border-t">
                          <div className="flex items-center">{gameLinks}</div>
                        </td>
                        <td
                          className={twMerge(
                            "text-left border pr-2",
                            p.rightPlayer.won && "bg-green-100",
                            p.rightPlayer.lost && "bg-red-100",
                            p.dead && "bg-gray-200"
                          )}
                        >
                          {p.rightPlayer.name}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            );
          })}
        </div>
      ))}
    </div>
  );
}

type ScheduleQuery = {
  leftPlayerId: number;
  leftPlayerName: string;
  leftTeamId: number;
  leftTeamName: string;
  leftTeamColor: string;
  rightPlayerId: number;
  rightPlayerName: string;
  rightTeamId: number;
  rightTeamName: string;
  rightTeamColor: string;
  regular_weeks: number;
  playoff_size: number;
  winner: number;
  dead: number;
  game1: string;
  game2: string;
  game3: string;
  game4: string;
  game5: string;
  weekNumber: number;
  matchupId: number;
}[];

type PlayerData = {
  id: number;
  name: string;
  won: boolean;
  lost: boolean;
};

type PairingData = {
  leftPlayer: PlayerData;
  rightPlayer: PlayerData;
  dead: boolean;
  games: string[];
};

type TeamData = {
  id: number;
  color: string;
  name: string;
};

type MatchupData = {
  id: number;
  leftTeam: TeamData;
  rightTeam: TeamData;
  pairings: PairingData[];
};

type ScheduleData = {
  regularWeeks: number;
  playoffSize: number;
  weeks: MatchupData[][];
};

export async function loader({ params: { season } }: Route.LoaderArgs) {
  const rawData = (await (
    await fetch(`https://mushileague.gg/api/season/${season}/schedule`)
  ).json()) as ScheduleQuery;

  const regularWeeks = rawData[0].regular_weeks;
  const playoffSize = rawData[0].playoff_size;
  const totalWeeks = Math.ceil(regularWeeks + Math.log2(playoffSize));

  const initialAccum: ScheduleData = {
    regularWeeks: rawData[0].regular_weeks,
    playoffSize: rawData[0].playoff_size,
    weeks: new Array(totalWeeks),
  };

  return rawData.reduce((accum, item) => {
    let week = accum.weeks.at(item.weekNumber - 1);

    if (week === undefined) {
      week = [];
      accum.weeks[item.weekNumber - 1] = week;
    }

    let matchup = week.find((matchup) => matchup.id === item.matchupId);

    if (matchup === undefined) {
      matchup = {
        id: item.matchupId,
        leftTeam: {
          id: item.leftTeamId,
          color: item.leftTeamColor,
          name: item.leftTeamName,
        },
        rightTeam: {
          id: item.rightTeamId,
          color: item.rightTeamColor,
          name: item.rightTeamName,
        },
        pairings: [],
      };
      accum.weeks[item.weekNumber - 1].push(matchup);
    }

    matchup.pairings.push({
      leftPlayer: {
        name: item.leftPlayerName,
        id: item.leftPlayerId,
        won: item.winner === item.leftPlayerId,
        lost: item.winner === item.rightPlayerId,
      },
      rightPlayer: {
        name: item.rightPlayerName,
        id: item.rightPlayerId,
        won: item.winner === item.rightPlayerId,
        lost: item.winner === item.leftPlayerId,
      },
      dead: item.dead === 1,
      games: [
        item.game1,
        item.game2,
        item.game3,
        item.game4,
        item.game5,
      ].filter(Boolean),
    });

    return accum;
  }, initialAccum);
}
