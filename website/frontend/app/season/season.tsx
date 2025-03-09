import { NavLink, Outlet, useLocation } from "react-router";
import { twMerge } from "tailwind-merge";
import { ArrowLeft } from "lucide-react";
import type { Route } from "./+types/season";
import { teamInitials } from "~/util/util";

type TeamQuery = {
  id: number;
  name: string;
  color: string;
}[];

export default function Season({
  params: { season },
  loaderData,
}: Route.ComponentProps) {
  const { pathname } = useLocation();

  return (
    <>
      <NavLink to="/" className="inline-flex gap-1 items-center">
        <ArrowLeft size={16} />
        Return to home
      </NavLink>
      <h1 className="text-center mb-1">Season {season}</h1>
      <nav className="flex gap-0.5 mb-2">
        {loaderData.map((team) => {
          const url = `/season/${season}/team/${team.id}`;
          return (
            <NavLink
              key={team.id}
              to={url}
              className={twMerge(
                "px-3 py-1 border-b-4 font-semibold grow text-center",
                pathname === url
                  ? "bg-gray-200"
                  : "bg-gray-50 hover:bg-gray-100"
              )}
              style={{ borderColor: team.color }}
            >
              {teamInitials(team.name)}
            </NavLink>
          );
        })}
        <NavLink
          to={`/season/${season}/schedule`}
          className={twMerge(
            "px-3 py-1 border-b-4 border-gray-400 font-semibold grow-2 text-center",
            pathname === `/season/${season}/schedule`
              ? "bg-gray-200"
              : "bg-gray-50 hover:bg-gray-100"
          )}
        >
          Schedule + Replays
        </NavLink>
        <NavLink
          to={`/season/${season}/standings`}
          className={twMerge(
            "px-3 py-1 border-b-4 border-gray-400 font-semibold grow-2 text-center",
            pathname === `/season/${season}/standings`
              ? "bg-gray-200"
              : "bg-gray-50 hover:bg-gray-100"
          )}
        >
          Standings
        </NavLink>
        <NavLink
          to={`/season/${season}/players`}
          className={twMerge(
            "px-3 py-1 border-b-4 border-gray-400 font-semibold grow-2 text-center",
            pathname === `/season/${season}/players`
              ? "bg-gray-200"
              : "bg-gray-50 hover:bg-gray-100"
          )}
        >
          Player Records
        </NavLink>
        <NavLink
          to={`/season/${season}/draft`}
          className={twMerge(
            "px-3 py-1 border-b-4 border-gray-400 font-semibold grow-2 text-center",
            pathname === `/season/${season}/draft`
              ? "bg-gray-200"
              : "bg-gray-50 hover:bg-gray-100"
          )}
        >
          Draft
        </NavLink>
      </nav>
      <Outlet />
    </>
  );
}

export async function loader({ params: { season } }: Route.LoaderArgs) {
  return (await (
    await fetch(`https://mushileague.gg/api/season/${season}`)
  ).json()) as TeamQuery;
}
