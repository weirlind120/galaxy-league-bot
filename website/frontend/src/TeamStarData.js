function TeamStarData({ players }) {
  const totStars = players.reduce((a, c) => a + c.stars, 0);
  const totPlayers = players.reduce((a, c) => a + 1, 0);
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div>Team Star Data</div>
      <div>Total Stars: {totStars}</div>
      <div>
        Average Stars Per Player:{" "}
        {Math.round((100 * totStars) / totPlayers) / 100}
      </div>
    </div>
  );
}

export default TeamStarData;
