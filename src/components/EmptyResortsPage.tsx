import React, { useState, useEffect } from "react";
import "../EmptyResortsPage.css";
import skier_downhill from "../assets/images/skier_downhill.png";
import skier_uphill from "../assets/images/skier_uphill.png";

function EmptyResortsPage() {
  const [skierImage, setSkierImage] = useState(skier_downhill);

  useEffect(() => {
    const interval = setInterval(() => {
      setSkierImage((prev) =>
        prev === skier_downhill ? skier_uphill : skier_downhill
      );
    }, 4000); // Switch images every 4 seconds (half of animation duration)

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="EmptyResortsPage_body">
      <div className="skier-container">
        <img className="skier" src={skierImage} alt="skier" />
      </div>
      <h1 className="loading-text">Načítavanie stredísk</h1>
      <p className="loading-text">Načítavanie stránky môže chvíľu trvať.</p>
      <p className="loading-text">
        V prípade nenáčitania žiadného strediska je databáza stredísk prázdna. V
        tomto prípade prosíme kontaktujte administrátora.
      </p>
    </div>
  );
}

export default EmptyResortsPage;
