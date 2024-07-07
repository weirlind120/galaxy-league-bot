function TeamHeader({ info }) {
  const differential = info.players.reduce(
    (a, c) => a + c.wins + c.act_wins - c.losses - c.act_losses,
    0
  );
  return (
    <div style={{ display: "flex", "flex-direction": "column" }}>
      <div>{info.name}</div>
      <div style={{ display: "flex", "flex-direction": "row" }}>
        <div>Points:{3 * info.wins + info.ties}</div>
        <div>Wins:{info.wins}</div>
        <div>Losses:{info.losses}</div>
        <div>Ties:{info.ties}</div>
        <div>Differential:{differential}</div>
      </div>
    </div>
  );
}

export default TeamHeader;
