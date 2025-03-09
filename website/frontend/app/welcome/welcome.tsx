import { Link } from "react-router";
import type { Route } from "./+types/welcome";

type SeasonsQuery = {
  number: number;
}[];

export default function Welcome({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex flex-col items-center">
      <h1 className="mb-8 text-center">
        Mushi League, the ADV OU team tournament
      </h1>
      <h2 className="mb-2 text-center">Past Seasons</h2>
      <div className="flex flex-col gap-2 max-w-full w-sm">
        {loaderData.map((s) =>
          s.hasData ? (
            <Link
              key={s.number}
              to={`/season/${s.number}/schedule`}
              className="border rounded-md text-center hover:bg-gray-50"
            >
              Season {s.number}
            </Link>
          ) : (
            <p key={s.number} className="text-center">
              Season {s.number} (coming soon!)
            </p>
          )
        )}
      </div>
    </div>
  );
}

export async function loader() {
  const rawData = (await (
    await fetch("https://mushileague.gg/api/seasons")
  ).json()) as SeasonsQuery;

  const lastNumber = rawData[0].number;
  const firstNumber = rawData[rawData.length - 1].number;

  return new Array(lastNumber + 1).fill(null).map((_, i) => ({
    number: lastNumber - i,
    hasData: lastNumber - i >= firstNumber,
  }));
}
