import "../GDPRPage.css";

const GDPRPage = () => {
  return (
    <div className="gdpr-container">
      <div className="gdpr-content">
        <h1>Ochrana osobných údajov (GDPR)</h1>
        <p className="intro-text">
          Vážený používateľ, vaše súkromie je pre nás dôležité. Táto stránka
          vysvetľuje, ako spracovávame vaše osobné údaje v súlade s nariadením
          GDPR.
        </p>

        <h2>Aké údaje zhromažďujeme?</h2>
        <ul className="gdpr-list">
          <li>Meno a priezvisko</li>
          <li>Telefónne číslo</li>
          <li>E-mailová adresa</li>
          <li>Športový klub</li>
          <li>ZSL-číslo</li>
        </ul>

        <h2>Prečo tieto údaje zhromažďujeme?</h2>
        <p>
          Údaje používame na spracovanie rezervácií, správu účtu a zlepšenie
          našich služieb.
        </p>

        <h2>Vaše práva</h2>
        <p>
          Máte právo na prístup, opravu alebo vymazanie svojich údajov. Ak
          chcete uplatniť svoje práva, kontaktujte nás na{" "}
          <b>rezervacia.treningzsl@gmail.com</b>.
        </p>

        <h2>Kontakt</h2>
        <p>Ak máte akékoľvek otázky, neváhajte nás kontaktovať.</p>
      </div>
    </div>
  );
};

export default GDPRPage;
