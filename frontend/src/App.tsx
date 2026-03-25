import { Route, Switch } from "wouter";

import Home from "./pages/Home";
import Corridors from "./pages/Corridors";
import Corridor from "./pages/Corridor";
import Content from "./pages/Content";
import Teachings from "./pages/Teachings";
import Rhapsodies from "./pages/Rhapsodies";
import Music from "./pages/Music";
import Games from "./pages/Games";
import Store from "./pages/Store";
import Membership from "./pages/Membership";
import Agent from "./pages/Agent";

import Ops from "./pages/ops/Ops";
import OpsContent from "./pages/ops/OpsContent";
import OpsPipeline from "./pages/ops/OpsPipeline";
import OpsAccess from "./pages/ops/OpsAccess";
import OpsLogs from "./pages/ops/OpsLogs";

import NotFound from "./pages/not-found";

export default function App() {
  return (
    <Switch>
      {/* Public routes */}
      <Route path="/"                component={Home} />
      <Route path="/corridors"       component={Corridors} />
      <Route path="/corridors/:id"   component={Corridor} />
      <Route path="/content"         component={Content} />
      <Route path="/teachings"       component={Teachings} />
      <Route path="/teachings/:slug" component={Teachings} />
      <Route path="/rhapsodies"      component={Rhapsodies} />
      <Route path="/rhapsodies/:slug" component={Rhapsodies} />
      <Route path="/music"           component={Music} />
      <Route path="/music/:slug"     component={Music} />
      <Route path="/games"           component={Games} />
      <Route path="/games/:slug"     component={Games} />
      <Route path="/store"           component={Store} />
      <Route path="/membership"      component={Membership} />
      <Route path="/agent"           component={Agent} />

      {/* Ops routes */}
      <Route path="/ops"             component={Ops} />
      <Route path="/ops/content"     component={OpsContent} />
      <Route path="/ops/pipeline"    component={OpsPipeline} />
      <Route path="/ops/access"      component={OpsAccess} />
      <Route path="/ops/logs"        component={OpsLogs} />

      {/* 404 */}
      <Route                         component={NotFound} />
    </Switch>
  );
}
