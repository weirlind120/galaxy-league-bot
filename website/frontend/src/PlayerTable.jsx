function PlayerTable({ players }) {
  return (
    <div>
      <table>
        <tr>
          <th>Player</th>
          <th>Differential</th>
          <th>Wins</th>
          <th>Act-W</th>
          <th>Losses</th>
          <th>Act-L</th>
          <th>Ties</th>
          <th>MP</th>
          <th>Star Points</th>
          <th>Star Rating</th>
        </tr>
        {players.map((val, key) => {
          return (
            <tr key={key}>
              <td>{val.name}</td>
              <td>{val.wins + val.act_wins - val.losses - val.act_losses}</td>
              <td>{val.wins}</td>
              <td>{val.act_wins}</td>
              <td>{val.losses}</td>
              <td>{val.act_losses}</td>
              <td>{val.ties}</td>
              <td>{val.wins + val.losses}</td>
              <td>{val.star_points}</td>
              <td>{val.stars}</td>
            </tr>
          );
        })}
      </table>
    </div>
  );
}

export default PlayerTable;
