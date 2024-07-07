import "./App.css";
import { useState, useEffect } from "react";
import Team from "./Team";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";

function App() {
  const [teamList, setTeamList] = useState();

    useEffect(() => {
    fetch("http://localhost:3001/teamlist")
      .then((x) => x.json())
      .then((x) => setTeamList(x))
      .catch((x) => console.log(x));
  }, []);

  return (
    <div className="App">
      {teamList ? (
        <div>
          <BrowserRouter>
            <nav>
              <ul>
                {teamList.map((team) => (
                  <li id={team.id}>
                    <Link to={"/" + team.id.toString()}>{team.name}</Link>
                  </li>
                ))}
              </ul>
            </nav>
            <Routes>
              {teamList.map((team) => (
                <Route
                  id={team.id}
                  path={"/" + team.id.toString()}
                  element={<Team id={team.id} />}
                />
              ))}
            </Routes>
          </BrowserRouter>
        </div>
      ) : (
        <div>gettin infos</div>
      )}
    </div>
  );
}

export default App;
