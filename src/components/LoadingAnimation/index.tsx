import React from "react";
import "./style.css";

export enum LoaderState {
  Loading,
  Finished,
}

const loadingAnimation: React.FC<{ state: LoaderState }> = ({ state }) => {
  if (state === LoaderState.Finished) {
    return null;
  }

  return (
    <div className="loading-animation-container">
      <svg
        className="spinner"
        width="50px"
        height="50px"
        viewBox="0 0 66 66"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle
          className="path"
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          cx="33"
          cy="33"
          r="30"
        ></circle>
      </svg>
    </div>
  );
};

export default loadingAnimation;
