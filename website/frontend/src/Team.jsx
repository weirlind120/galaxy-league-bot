import TeamStarData from "./TeamStarData";
import { useState, useEffect } from "react";
import TeamHeader from "./TeamHeader";
import PlayerTable from "./PlayerTable";

function Team({ id }) {
  const [info, setInfo] = useState();
  useEffect(() => {
    fetch(`https://mushileague.gg/teaminfo/${id}/`)
      .then((x) => x.json())
      .then((x) => setInfo(x))
      .catch((x) => console.log(x));
  }, [id]);

  return info ? (
    <div style={{ display: "flex", flexDirection: "row" }}>
      <div
        style={{
          backgroundColor: "red",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {"wooperimg"}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
          }}
        >
          {"Captain  "}
          {info.captain}
        </div>
        <TeamStarData players={info.players} />
      </div>
      <div
        style={{
          backgroundColor: "blue",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <TeamHeader info={info} />
        <PlayerTable players={info.players} />
      </div>
    </div>
  ) : (
    <div> gottin infos</div>
  );
}

export default Team;
