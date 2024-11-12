import React from "react";
import "../EmptyResortsPage.css";

function EmptyResortsPage() {
  return (
    <div className="EmptyResortsPage_body">
      <h1>Načítavanie stredísk</h1>
      <p>Načítavanie stránky môže chvíľu trvať.</p>
      <p>
        V prípade nenáčitania žiadného strediska je databáza stredísk prázdna. V
        tomto prípade prosíme kontaktujte administrátora.
      </p>
    </div>
  );
}

export default EmptyResortsPage;
